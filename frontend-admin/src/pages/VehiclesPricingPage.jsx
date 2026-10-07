import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Save, ArrowRight } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import PricingRulesSection, { MoneyCellInput, Switch, cellInputClass } from './PricingRulesSection';
import { Button, Card, Field, Input, Money, Notice, PageHeader, SectionHeader, Sheet, Spinner, Table, cx } from '../components/ui';

// A base price/rate of 0 or below is never a real, intentional price on a
// live platform (it would mean a free ride/delivery/service) - it is almost
// always a typo or an accidental clear of the input. Reject it client-side
// before it ever reaches the table the customer app reads live from.
const isSanePrice = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const emptyDraft = { name: '', type: '', service_type: 'ride', price: 0, per_km_rate: 0, capacity: 1, duration: '', is_active: true };

// public.pricing_rules groups: WiraSend/Service/Pool tiers are flat fees
// (per_km_rate is always 0 for them per migration 0057's seed), so only the
// WiraFood delivery-fee section exposes the per-km input to avoid clutter.
const RULE_GROUPS = [
  { key: 'send', title: 'WiraSend - Paket Kirim', description: 'Harga = harga dasar + (tarif/km x jarak jalan). Isi tarif/km 0 untuk harga tetap berapa pun jaraknya.', showPerKmRate: true },
  { key: 'service', title: 'WiraService - Tarif Layanan', description: 'Harga dasar tiap kategori jasa servis.', showPerKmRate: false },
  { key: 'pool', title: 'WiraPool - Tarif Layanan', description: 'Harga dasar tiap layanan kolam renang.', showPerKmRate: false },
  { key: 'babysit', title: 'WiraAsuh - Tarif Pengasuh', description: 'HOURLY = tarif per jam (1 anak); EXTRA_CHILD = tambahan per anak berikutnya per jam.', showPerKmRate: false },
  { key: 'food_delivery', title: 'WiraFood - Ongkos Kirim', description: 'Formula ongkos kirim: harga dasar + (tarif/km x jarak).', showPerKmRate: true },
];

const VehiclesPricingPage = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState(emptyDraft);

  // public.pricing_rules (WiraSend/Service/Pool/Food delivery-fee) - kept as
  // separate state from vehicles so a missing/errored pricing_rules table
  // (e.g. migration 0057 not yet applied in this environment) only degrades
  // that section instead of crashing the whole page.
  const [pricingRules, setPricingRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState(null);
  const [rulesEdits, setRulesEdits] = useState({});

  // Row pending an explicit confirm before its price change actually
  // commits - this page's own subtitle says changes apply immediately to
  // the customer app, so a single accidental click on "Simpan" used to be
  // enough to push a live price change with no way to back out.
  const [confirmVehicle, setConfirmVehicle] = useState(null);
  const [confirmRule, setConfirmRule] = useState(null);
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState(null);

  const fetchVehicles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('service_type', { ascending: true })
      .order('price', { ascending: true });

    if (error) {
      toast.error('Gagal memuat data kendaraan');
    } else {
      setVehicles(data || []);
      setEdits({});
    }
    setLoading(false);
  };

  const fetchPricingRules = async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const { data, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .order('service_type', { ascending: true })
        .order('code', { ascending: true });
      if (error) throw error;
      // WiraService menu items (migrations/0090, item_of = category code)
      // sit right under their category row, in menu order.
      const groupKey = (r) => r.item_of || r.code;
      const sorted = (data || []).slice().sort((a, b) =>
        a.service_type.localeCompare(b.service_type)
        || groupKey(a).localeCompare(groupKey(b))
        || (a.item_of ? 1 : 0) - (b.item_of ? 1 : 0)
        || (a.sort_order ?? 100) - (b.sort_order ?? 100)
        || a.code.localeCompare(b.code));
      setPricingRules(sorted);
      setRulesEdits({});
    } catch (err) {
      // Table not yet migrated (0057) or another fetch failure - degrade
      // gracefully to an inline error state for this section only.
      setPricingRules([]);
      setRulesError(err.message || 'Gagal memuat data tarif layanan.');
    }
    setRulesLoading(false);
  };

  useEffect(() => {
    fetchVehicles();
    fetchPricingRules();
  }, []);

  const getField = (v, field) => (edits[v.id]?.[field] !== undefined ? edits[v.id][field] : v[field]);

  const setField = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const isDirty = (id) => !!edits[id];

  // Step 1: validate, then ask for confirmation instead of saving directly.
  const handleSaveRow = (v) => {
    const patch = edits[v.id];
    if (!patch) return;
    if (patch.price !== undefined && !isSanePrice(patch.price)) {
      toast.error('Harga dasar harus lebih besar dari 0');
      return;
    }
    if (patch.per_km_rate !== undefined && !isSanePrice(patch.per_km_rate)) {
      toast.error('Tarif/km harus lebih besar dari 0');
      return;
    }
    setConfirmVehicle(v);
  };

  // Step 2: only reached after the operator confirms in the ConfirmModal.
  const executeSaveVehicle = async (v) => {
    const patch = edits[v.id];
    if (!patch) { setConfirmVehicle(null); return; }
    try {
      const { error, data } = await supabase
        .from('vehicles')
        .update(patch)
        .eq('id', v.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success(`${v.name} berhasil diperbarui`);
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan perubahan');
    } finally {
      setConfirmVehicle(null);
    }
  };

  const handleDelete = async (v) => {
    // Confirmation now happens in the ConfirmModal (deleteVehicleTarget).
    try {
      const { error, data } = await supabase.from('vehicles').delete().eq('id', v.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success('Berhasil dihapus');
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus');
    }
  };

  const handleCreate = async () => {
    if (!newDraft.name || !newDraft.type) {
      toast.error('Nama dan tipe wajib diisi');
      return;
    }
    if (!isSanePrice(newDraft.price)) {
      toast.error('Harga dasar harus lebih besar dari 0');
      return;
    }
    if (!isSanePrice(newDraft.per_km_rate)) {
      toast.error('Tarif/km harus lebih besar dari 0');
      return;
    }
    try {
      const { error, data } = await supabase.from('vehicles').insert([newDraft]).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak saat menambahkan.');
      toast.success('Kendaraan baru ditambahkan');
      setNewDraft(emptyDraft);
      setShowNewForm(false);
      fetchVehicles();
    } catch (err) {
      toast.error(err.message || 'Gagal menambahkan kendaraan');
    }
  };

  // --- pricing_rules: same edit/save/delete/create pattern as vehicles above ---

  const getRuleField = (r, field) => (rulesEdits[r.id]?.[field] !== undefined ? rulesEdits[r.id][field] : r[field]);

  const setRuleField = (id, field, value) => {
    setRulesEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const isRuleDirty = (id) => !!rulesEdits[id];

  // Step 1: validate, then ask for confirmation instead of saving directly.
  // per_km_rate is only meaningfully validated for the food_delivery group -
  // it's genuinely 0-by-design for the flat-fee send/service/pool tiers
  // (migration 0057) and isn't even editable in the UI for those groups.
  const handleSaveRule = (r) => {
    const patch = rulesEdits[r.id];
    if (!patch) return;
    if (patch.base_price !== undefined && !isSanePrice(patch.base_price)) {
      toast.error('Harga dasar harus lebih besar dari 0');
      return;
    }
    const group = RULE_GROUPS.find(g => g.key === r.service_type);
    // WiraSend may be a flat price (0/km); food delivery always needs a rate.
    const perKmOk = r.service_type === 'send'
      ? Number.isFinite(Number(patch.per_km_rate)) && Number(patch.per_km_rate) >= 0
      : isSanePrice(patch.per_km_rate);
    if (group?.showPerKmRate && patch.per_km_rate !== undefined && !perKmOk) {
      toast.error(r.service_type === 'send' ? 'Tarif/km tidak boleh negatif' : 'Tarif/km harus lebih besar dari 0');
      return;
    }
    setConfirmRule(r);
  };

  // Step 2: only reached after the operator confirms in the ConfirmModal.
  const executeSaveRule = async (r) => {
    const patch = rulesEdits[r.id];
    if (!patch) { setConfirmRule(null); return; }
    try {
      const { error, data } = await supabase
        .from('pricing_rules')
        .update(patch)
        .eq('id', r.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success(`${r.name} berhasil diperbarui`);
      fetchPricingRules();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan perubahan');
    } finally {
      setConfirmRule(null);
    }
  };

  const handleDeleteRule = async (r) => {
    // Confirmation now happens in the ConfirmModal (deleteRuleTarget).
    try {
      const { error, data } = await supabase.from('pricing_rules').delete().eq('id', r.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success('Berhasil dihapus');
      fetchPricingRules();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus');
    }
  };

  const handleCreateRule = async (draft) => {
    if (!draft.code || !draft.name) {
      toast.error('Kode dan nama wajib diisi');
      return false;
    }
    if (!isSanePrice(draft.base_price)) {
      toast.error('Harga dasar harus lebih besar dari 0');
      return false;
    }
    if (draft.service_type === 'food_delivery' && !isSanePrice(draft.per_km_rate)) {
      toast.error('Tarif/km harus lebih besar dari 0');
      return false;
    }
    try {
      const { error, data } = await supabase.from('pricing_rules').insert([draft]).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak saat menambahkan.');
      toast.success('Tarif baru ditambahkan');
      fetchPricingRules();
      return true;
    } catch (err) {
      toast.error(err.message || 'Gagal menambahkan tarif');
      return false;
    }
  };

  // Stable so the Sheet doesn't re-run its focus effect on every keystroke.
  const cancelNewVehicle = useCallback(() => { setShowNewForm(false); setNewDraft(emptyDraft); }, []);

  // Before/after rows for the confirm sheets (display only).
  const priceChanges = (row, patch, baseField) => {
    const out = [];
    if (patch[baseField] !== undefined) out.push({ label: 'Harga dasar', from: row[baseField], to: patch[baseField] });
    if (patch.per_km_rate !== undefined) out.push({ label: 'Tarif/km', from: row.per_km_rate, to: patch.per_km_rate });
    return out;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Harga"
        subtitle="Kelola tarif WiraRide, WiraSend, WiraService, WiraPool, dan ongkos kirim WiraFood. Perubahan berlaku langsung ke aplikasi pelanggan."
        actions={(
          <Button
            variant="secondary"
            onClick={() => { fetchVehicles(); fetchPricingRules(); }}
            title="Muat ulang semua data harga"
            aria-label="Muat ulang semua data harga"
            className="px-3"
          >
            <RefreshCw size={18} className={(loading || rulesLoading) ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <section>
        <SectionHeader
          title="WiraRide - Kendaraan"
          action={(
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setShowNewForm(v => !v)}>
              Tambah
            </Button>
          )}
        />

        <Table titleCol={1}>
          <thead>
            <tr>
              <th>Layanan</th>
              <th>Nama</th>
              <th>Tipe</th>
              <th className="text-right">Harga Dasar</th>
              <th className="text-right">Tarif/km</th>
              <th className="text-right">Kapasitas</th>
              <th>Durasi</th>
              <th>Aktif</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => {
              const dirty = isDirty(v.id);
              return (
                <tr key={v.id} className={dirty ? '[&>td]:bg-warning-soft/60' : ''}>
                  <td className="whitespace-nowrap font-mono text-[12.5px] text-ink-muted">{v.service_type}</td>
                  <td className="whitespace-nowrap font-semibold">{v.name}</td>
                  <td className="whitespace-nowrap text-ink-muted">{v.type}</td>
                  <td className="text-right">
                    <MoneyCellInput
                      aria-label={`Harga dasar ${v.name}`}
                      value={getField(v, 'price')}
                      onChange={e => setField(v.id, 'price', Number(e.target.value))}
                      className="ml-auto w-36"
                    />
                  </td>
                  <td className="text-right">
                    <MoneyCellInput
                      aria-label={`Tarif/km ${v.name}`}
                      value={getField(v, 'per_km_rate')}
                      onChange={e => setField(v.id, 'per_km_rate', Number(e.target.value))}
                      className="ml-auto w-32"
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number"
                      aria-label={`Kapasitas ${v.name}`}
                      value={getField(v, 'capacity')}
                      onChange={e => setField(v.id, 'capacity', Number(e.target.value))}
                      className={cx(cellInputClass, 'ml-auto w-16 text-right font-mono')}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Durasi ${v.name}`}
                      value={getField(v, 'duration') || ''}
                      onChange={e => setField(v.id, 'duration', e.target.value)}
                      className={cx(cellInputClass, 'w-24 font-mono')}
                    />
                  </td>
                  <td className="!py-1">
                    <Switch
                      checked={!!getField(v, 'is_active')}
                      onChange={() => setField(v.id, 'is_active', !getField(v, 'is_active'))}
                      label={`Aktif ${v.name}`}
                    />
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant={dirty ? 'primary' : 'secondary'}
                        disabled={!dirty}
                        onClick={() => handleSaveRow(v)}
                        leftIcon={<Save size={15} />}
                        title="Simpan perubahan"
                      >
                        Simpan
                      </Button>
                      <Button size="sm" variant="danger-soft" onClick={() => setDeleteVehicleTarget(v)} title="Hapus" aria-label="Hapus" className="px-2.5">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {vehicles.length === 0 && !loading && (
              <tr>
                <td colSpan="9" className="py-8 text-center text-ink-muted">Belum ada data kendaraan/harga.</td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Tarif Layanan Lain</h2>
          <p className="text-[13px] text-ink-muted">Kelola harga paket WiraSend, tarif WiraService dan WiraPool, serta ongkos kirim WiraFood.</p>
        </div>

        {rulesError ? (
          <Notice tone="warning">
            Data tarif layanan belum bisa dimuat ({rulesError}). Bagian ini butuh tabel <code className="font-mono">public.pricing_rules</code> (migrasi 0057) - jalankan migrasinya lalu klik muat ulang. Data kendaraan WiraRide di atas tidak terpengaruh.
          </Notice>
        ) : rulesLoading && pricingRules.length === 0 ? (
          <Card className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
            <Spinner size={16} /> Memuat data tarif layanan...
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {RULE_GROUPS.map(g => (
              <PricingRulesSection
                key={g.key}
                title={g.title}
                description={g.description}
                serviceType={g.key}
                showPerKmRate={g.showPerKmRate}
                rows={pricingRules.filter(r => r.service_type === g.key)}
                getField={getRuleField}
                setField={setRuleField}
                isDirty={isRuleDirty}
                onSave={handleSaveRule}
                onDelete={setDeleteRuleTarget}
                onCreate={handleCreateRule}
              />
            ))}
          </div>
        )}
      </section>

      {/* Tambah kendaraan */}
      <Sheet
        open={showNewForm}
        onClose={cancelNewVehicle}
        title="Tambah Kendaraan"
        description="WiraRide - Kendaraan"
        icon={<Plus size={20} />}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={cancelNewVehicle}>Batal</Button>
            <Button leftIcon={<Save size={17} />} onClick={handleCreate}>Simpan</Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nama" htmlFor="vehicle-new-name" className="sm:col-span-2">
            <Input id="vehicle-new-name" placeholder="mis. WiraRide Motor" value={newDraft.name} onChange={e => setNewDraft({ ...newDraft, name: e.target.value })} />
          </Field>
          <Field label="Tipe" htmlFor="vehicle-new-type">
            <Input id="vehicle-new-type" placeholder="mis. motor" value={newDraft.type} onChange={e => setNewDraft({ ...newDraft, type: e.target.value })} />
          </Field>
          <Field label="Layanan" htmlFor="vehicle-new-service">
            <Input id="vehicle-new-service" placeholder="mis. ride" value={newDraft.service_type} onChange={e => setNewDraft({ ...newDraft, service_type: e.target.value })} />
          </Field>
          <Field label="Harga dasar (Rp)" htmlFor="vehicle-new-price">
            <Input id="vehicle-new-price" type="number" value={newDraft.price} onChange={e => setNewDraft({ ...newDraft, price: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="Tarif/km (Rp)" htmlFor="vehicle-new-perkm">
            <Input id="vehicle-new-perkm" type="number" value={newDraft.per_km_rate} onChange={e => setNewDraft({ ...newDraft, per_km_rate: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="Kapasitas" htmlFor="vehicle-new-capacity">
            <Input id="vehicle-new-capacity" type="number" value={newDraft.capacity} onChange={e => setNewDraft({ ...newDraft, capacity: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="Estimasi durasi" htmlFor="vehicle-new-duration">
            <Input id="vehicle-new-duration" placeholder="mis. 15 mnt" value={newDraft.duration} onChange={e => setNewDraft({ ...newDraft, duration: e.target.value })} />
          </Field>
        </div>
      </Sheet>

      <PriceChangeSheet
        open={!!confirmVehicle}
        title="Konfirmasi Perubahan Harga"
        intro={confirmVehicle ? `Anda akan mengubah harga "${confirmVehicle.name}":` : ''}
        changes={confirmVehicle ? priceChanges(confirmVehicle, edits[confirmVehicle.id] || {}, 'price') : []}
        onConfirm={() => executeSaveVehicle(confirmVehicle)}
        onCancel={() => setConfirmVehicle(null)}
      />

      <PriceChangeSheet
        open={!!confirmRule}
        title="Konfirmasi Perubahan Tarif"
        intro={confirmRule ? `Anda akan mengubah tarif "${confirmRule.name}":` : ''}
        changes={confirmRule ? priceChanges(confirmRule, rulesEdits[confirmRule.id] || {}, 'base_price') : []}
        onConfirm={() => executeSaveRule(confirmRule)}
        onCancel={() => setConfirmRule(null)}
      />

      <ConfirmModal
        isOpen={!!deleteVehicleTarget}
        tone="danger"
        title="Hapus Kendaraan"
        message={deleteVehicleTarget ? `Hapus "${deleteVehicleTarget.name}" dari daftar harga?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => { const v = deleteVehicleTarget; setDeleteVehicleTarget(null); handleDelete(v); }}
        onCancel={() => setDeleteVehicleTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteRuleTarget}
        tone="danger"
        title="Hapus Tarif"
        message={deleteRuleTarget ? `Hapus "${deleteRuleTarget.name}" dari daftar tarif?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => { const r = deleteRuleTarget; setDeleteRuleTarget(null); handleDeleteRule(r); }}
        onCancel={() => setDeleteRuleTarget(null)}
      />
    </div>
  );
};

// Price-change confirmation: old -> new amounts in mono, plus the
// "applies immediately" warning.
function PriceChangeSheet({ open, title, intro, changes, onConfirm, onCancel }) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      description={intro}
      tone="pay"
      icon={<Save size={20} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Batal</Button>
          <Button onClick={onConfirm}>Konfirmasi</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        {changes.length > 0 && (
          <dl className="divide-y divide-line rounded-control border border-line bg-card">
            {changes.map(c => (
              <div key={c.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
                <dt className="flex-1 text-ink-muted">{c.label}</dt>
                <dd className="flex items-center gap-2">
                  <Money value={c.from || 0} tone="muted" className="line-through decoration-ink-muted/50" />
                  <ArrowRight size={14} className="text-ink-muted" aria-hidden="true" />
                  <Money value={c.to} className="font-semibold text-ink" />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <Notice tone="warning">Perubahan berlaku langsung ke aplikasi pelanggan.</Notice>
      </div>
    </Sheet>
  );
}

export default VehiclesPricingPage;
