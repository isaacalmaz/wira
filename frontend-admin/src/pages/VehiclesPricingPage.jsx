import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Save, X } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';
import PricingRulesSection from './PricingRulesSection';

const emptyDraft = { name: '', type: '', service_type: 'ride', price: 0, per_km_rate: 0, capacity: 1, duration: '', is_active: true };

// public.pricing_rules groups: WiraSend/Service/Pool tiers are flat fees
// (per_km_rate is always 0 for them per migration 0057's seed), so only the
// WiraFood delivery-fee section exposes the per-km input to avoid clutter.
const RULE_GROUPS = [
  { key: 'send', title: 'WiraSend - Paket Kirim', description: 'Harga tiap tingkat paket kiriman.', showPerKmRate: false },
  { key: 'service', title: 'WiraService - Tarif Layanan', description: 'Harga dasar tiap kategori jasa servis.', showPerKmRate: false },
  { key: 'pool', title: 'WiraPool - Tarif Layanan', description: 'Harga dasar tiap layanan kolam renang.', showPerKmRate: false },
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
      setPricingRules(data || []);
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

  const handleSaveRow = async (v) => {
    const patch = edits[v.id];
    if (!patch) return;
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
    }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Hapus "${v.name}" dari daftar harga?`)) return;
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

  const handleSaveRule = async (r) => {
    const patch = rulesEdits[r.id];
    if (!patch) return;
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
    }
  };

  const handleDeleteRule = async (r) => {
    if (!window.confirm(`Hapus "${r.name}" dari daftar tarif?`)) return;
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Harga</h1>
          <p className="text-sm text-slate-500">Kelola tarif WiraRide, WiraSend, WiraService, WiraPool, dan ongkos kirim WiraFood. Perubahan berlaku langsung ke aplikasi pelanggan.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { fetchVehicles(); fetchPricingRules(); }}
            className="p-2 border rounded-xl hover:bg-slate-50 dark:border-slate-700"
            title="Muat ulang semua data harga"
          >
            <RefreshCw size={20} className={(loading || rulesLoading) ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">WiraRide - Kendaraan</h2>
          <button onClick={() => setShowNewForm(v => !v)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl">
            <Plus size={20} /> Tambah
          </button>
        </div>
      </div>

      {showNewForm && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input placeholder="Nama (mis. WiraRide Motor)" value={newDraft.name} onChange={e => setNewDraft({ ...newDraft, name: e.target.value })} className="col-span-2 px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Tipe (mis. motor)" value={newDraft.type} onChange={e => setNewDraft({ ...newDraft, type: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Layanan (mis. ride)" value={newDraft.service_type} onChange={e => setNewDraft({ ...newDraft, service_type: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Harga dasar" value={newDraft.price} onChange={e => setNewDraft({ ...newDraft, price: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Tarif/km" value={newDraft.per_km_rate} onChange={e => setNewDraft({ ...newDraft, per_km_rate: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input type="number" placeholder="Kapasitas" value={newDraft.capacity} onChange={e => setNewDraft({ ...newDraft, capacity: Number(e.target.value) })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <input placeholder="Estimasi durasi (mis. 15 mnt)" value={newDraft.duration} onChange={e => setNewDraft({ ...newDraft, duration: e.target.value })} className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700" />
          <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end">
            <button onClick={() => { setShowNewForm(false); setNewDraft(emptyDraft); }} className="px-4 py-2 rounded-lg border dark:border-slate-700 flex items-center gap-1">
              <X size={16} /> Batal
            </button>
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-primary text-white flex items-center gap-1">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
              <tr>
                <th className="p-4 font-semibold">Layanan</th>
                <th className="p-4 font-semibold">Nama</th>
                <th className="p-4 font-semibold">Tipe</th>
                <th className="p-4 font-semibold">Harga Dasar</th>
                <th className="p-4 font-semibold">Tarif/km</th>
                <th className="p-4 font-semibold">Kapasitas</th>
                <th className="p-4 font-semibold">Durasi</th>
                <th className="p-4 font-semibold">Aktif</th>
                <th className="p-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {vehicles.map(v => (
                <tr key={v.id} className={isDirty(v.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                  <td className="p-4 text-slate-500">{v.service_type}</td>
                  <td className="p-4 font-bold text-slate-900 dark:text-white">{v.name}</td>
                  <td className="p-4 text-slate-500">{v.type}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'price')}
                      onChange={e => setField(v.id, 'price', Number(e.target.value))}
                      className="w-28 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'per_km_rate')}
                      onChange={e => setField(v.id, 'per_km_rate', Number(e.target.value))}
                      className="w-24 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(v, 'capacity')}
                      onChange={e => setField(v.id, 'capacity', Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      value={getField(v, 'duration') || ''}
                      onChange={e => setField(v.id, 'duration', e.target.value)}
                      className="w-24 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={!!getField(v, 'is_active')}
                      onChange={e => setField(v.id, 'is_active', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-4 flex gap-2">
                    <button
                      disabled={!isDirty(v.id)}
                      onClick={() => handleSaveRow(v)}
                      className="p-1.5 text-primary disabled:text-slate-300 disabled:cursor-not-allowed hover:bg-primary/10 rounded-lg transition"
                      title="Simpan perubahan"
                    >
                      <Save size={16} />
                    </button>
                    <button onClick={() => handleDelete(v)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-500">Belum ada data kendaraan/harga.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pt-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Tarif Layanan Lain</h2>
        <p className="text-sm text-slate-500 mb-4">Kelola harga paket WiraSend, tarif WiraService dan WiraPool, serta ongkos kirim WiraFood.</p>

        {rulesError ? (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-sm text-amber-800 dark:text-amber-300">
            Data tarif layanan belum bisa dimuat ({rulesError}). Bagian ini butuh tabel <code>public.pricing_rules</code> (migrasi 0057) - jalankan migrasinya lalu klik muat ulang. Data kendaraan WiraRide di atas tidak terpengaruh.
          </div>
        ) : rulesLoading && pricingRules.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center text-slate-500 text-sm">
            Memuat data tarif layanan...
          </div>
        ) : (
          <div className="space-y-6">
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
                onDelete={handleDeleteRule}
                onCreate={handleCreateRule}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehiclesPricingPage;
