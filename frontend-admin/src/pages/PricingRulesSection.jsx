import { useState, useCallback } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Segmented, Select, Sheet, Table, Textarea, cx } from '../components/ui';

// Presentational, per-service_type editable table for public.pricing_rules.
// All Supabase calls (fetch/update/insert/delete) and the RLS-trap check
// live in the parent (VehiclesPricingPage) so both this table and the
// vehicles table share one proven mutation pattern - this component just
// renders rows and forwards intent (save/delete/create) upward.
const emptyDraft = { code: '', name: '', base_price: 0, per_km_rate: 0, is_active: true };
// WiraService extras (migrations/0090 + 0123): an item belongs to a category
// (item_of); a new category also gets its "Pekerjaan lain" item.
const emptyServiceExtras = { kind: 'item', item_of: '', unit_label: 'unit', max_qty: 5, description: '' };
const CUSTOM_ITEM_DESC = 'Tidak ada di daftar? Tulis kebutuhan Anda, teknisi memberi harga di lokasi.';

// Compact in-table input (the kit Input is sized for forms, 44px / 15px).
export const cellInputClass = 'block min-h-9 rounded-[10px] border border-line-strong bg-card px-2.5 py-1.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20';

// Rupiah amount input for table cells: "Rp" adornment, mono, right-aligned.
export const MoneyCellInput = ({ value, onChange, className = '', ...props }) => (
  <div className={cx('relative', className)}>
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-muted">Rp</span>
    <input
      type="number"
      value={value}
      onChange={onChange}
      className={cx(cellInputClass, 'w-full pl-8 text-right font-mono')}
      {...props}
    />
  </div>
);

// On/off switch: 44px touch area around a compact track.
export const Switch = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-55"
  >
    <span className={cx('relative inline-flex h-6 w-10 items-center rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand/30', checked ? 'border-brand bg-brand' : 'border-line-strong bg-sunken')}>
      <span className={cx('absolute left-0.5 h-[18px] w-[18px] rounded-full bg-card shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </span>
  </button>
);

const PricingRulesSection = ({
  title,
  description,
  serviceType,
  rows,
  getField,
  setField,
  isDirty,
  onSave,
  onDelete,
  onCreate,
  showPerKmRate = false,
}) => {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState(emptyDraft);
  const [extras, setExtras] = useState(emptyServiceExtras);
  const isService = serviceType === 'service';
  const serviceCategories = isService ? rows.filter((r) => !r.item_of && r.code !== 'CHECK_FEE') : [];
  const checkFee = Number(rows.find((r) => r.code === 'CHECK_FEE')?.base_price || 50000);

  const handleCreate = async () => {
    if (!newDraft.code || !newDraft.name) return;
    if (!isService) {
      const ok = await onCreate({ ...newDraft, service_type: serviceType });
      if (ok) { setNewDraft(emptyDraft); setShowNewForm(false); }
      return;
    }
    const code = newDraft.code.trim();
    if (extras.kind === 'item') {
      if (!extras.item_of) return;
      const ok = await onCreate({
        ...newDraft, code, service_type: serviceType, item_of: extras.item_of,
        unit_label: extras.unit_label || null, max_qty: Number(extras.max_qty) || 1,
        description: extras.description.trim() || null,
      });
      if (ok) { setNewDraft(emptyDraft); setExtras(emptyServiceExtras); setShowNewForm(false); }
      return;
    }
    // New category: the row itself, then its "Pekerjaan lain" item.
    const ok = await onCreate({ ...newDraft, code, service_type: serviceType, max_qty: 1 });
    if (!ok) return;
    await onCreate({
      service_type: serviceType, code: `${code}_LAIN`, name: 'Pekerjaan lain', base_price: checkFee,
      per_km_rate: 0, is_active: true, item_of: code, unit_label: 'kunjungan', max_qty: 1,
      sort_order: 999, is_custom: true, description: CUSTOM_ITEM_DESC,
    });
    setNewDraft(emptyDraft);
    setExtras(emptyServiceExtras);
    setShowNewForm(false);
  };

  // Stable so the Sheet doesn't re-run its focus effect on every keystroke.
  const cancelNew = useCallback(() => { setShowNewForm(false); setNewDraft(emptyDraft); setExtras(emptyServiceExtras); }, []);

  const colSpan = showPerKmRate ? 6 : 5;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-[15px] font-bold tracking-tight text-ink">{title}</h3>
          {description && <p className="text-[12.5px] text-ink-muted">{description}</p>}
        </div>
        <Button size="sm" variant="secondary" leftIcon={<Plus size={15} />} onClick={() => setShowNewForm(v => !v)}>
          Tambah
        </Button>
      </div>

      <Table className="rounded-none border-0">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th className="text-right">Harga Dasar</th>
              {showPerKmRate && <th className="text-right">Tarif/km</th>}
              <th>Aktif</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dirty = isDirty(r.id);
              return (
                <tr key={r.id} className={dirty ? '[&>td]:bg-warning-soft/60' : ''}>
                  <td className={cx('whitespace-nowrap font-mono text-[12.5px] text-ink-muted', r.item_of && 'pl-8')}>
                    {r.item_of && <span className="mr-1.5 text-line-strong" aria-hidden="true">└</span>}
                    {r.code}
                    {r.unit_label && <span className="ml-1.5 font-sans text-[11.5px]">/ {r.unit_label}</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`Nama ${r.code}`}
                        value={getField(r, 'name') || ''}
                        onChange={e => setField(r.id, 'name', e.target.value)}
                        className={cx(cellInputClass, 'w-48')}
                      />
                      {r.is_custom && <Badge tone="pay">Harga di lokasi</Badge>}
                    </div>
                  </td>
                  <td className="text-right">
                    <MoneyCellInput
                      aria-label={`Harga dasar ${r.code}`}
                      value={getField(r, 'base_price')}
                      onChange={e => setField(r.id, 'base_price', Number(e.target.value))}
                      className="ml-auto w-36"
                    />
                  </td>
                  {showPerKmRate && (
                    <td className="text-right">
                      <MoneyCellInput
                        aria-label={`Tarif/km ${r.code}`}
                        value={getField(r, 'per_km_rate')}
                        onChange={e => setField(r.id, 'per_km_rate', Number(e.target.value))}
                        className="ml-auto w-32"
                      />
                    </td>
                  )}
                  <td className="!py-1">
                    <Switch
                      checked={!!getField(r, 'is_active')}
                      onChange={() => setField(r.id, 'is_active', !getField(r, 'is_active'))}
                      label={`Aktif ${r.code}`}
                    />
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant={dirty ? 'primary' : 'secondary'}
                        disabled={!dirty}
                        onClick={() => onSave(r)}
                        leftIcon={<Save size={15} />}
                        title="Simpan perubahan"
                      >
                        Simpan
                      </Button>
                      <Button size="sm" variant="danger-soft" onClick={() => onDelete(r)} title="Hapus" aria-label="Hapus" className="px-2.5">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-8 text-center text-ink-muted">Belum ada tarif untuk layanan ini.</td>
              </tr>
            )}
          </tbody>
      </Table>

      <Sheet
        open={showNewForm}
        onClose={cancelNew}
        title="Tambah Tarif"
        description={title}
        icon={<Plus size={20} />}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={cancelNew}>Batal</Button>
            <Button leftIcon={<Save size={17} />} onClick={handleCreate}>Simpan</Button>
          </>
        )}
      >
        {isService && (
          <div className="mb-4 flex flex-col gap-2">
            <Segmented
              ariaLabel="Jenis tarif"
              value={extras.kind}
              onChange={(kind) => setExtras({ ...extras, kind })}
              options={[{ value: 'item', label: 'Item di kategori' }, { value: 'category', label: 'Kategori baru' }]}
            />
            <p className="text-[12.5px] text-ink-muted">
              {extras.kind === 'item'
                ? 'Pekerjaan berharga tetap yang bisa dipilih pelanggan di sebuah kategori.'
                : 'Kode kategori harus sama persis dengan kode keahlian teknisi (mis. CCTV). Item "Pekerjaan lain" seharga biaya cek ikut dibuat otomatis. Kategori baru tampil di aplikasi setelah ada teknisi dengan keahlian itu.'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isService && extras.kind === 'item' && (
            <Field label="Kategori" htmlFor="rule-new-item-of" className="sm:col-span-2">
              <Select id="rule-new-item-of" value={extras.item_of} onChange={(e) => setExtras({ ...extras, item_of: e.target.value })}>
                <option value="">Pilih kategori</option>
                {serviceCategories.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
              </Select>
            </Field>
          )}
          <Field label="Kode" htmlFor={`rule-new-code-${serviceType}`}>
            <Input
              id={`rule-new-code-${serviceType}`}
              placeholder="mis. kecil"
              value={newDraft.code}
              onChange={e => setNewDraft({ ...newDraft, code: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Nama tampilan" htmlFor={`rule-new-name-${serviceType}`}>
            <Input
              id={`rule-new-name-${serviceType}`}
              value={newDraft.name}
              onChange={e => setNewDraft({ ...newDraft, name: e.target.value })}
            />
          </Field>
          <Field label="Harga dasar (Rp)" htmlFor={`rule-new-price-${serviceType}`}>
            <Input
              id={`rule-new-price-${serviceType}`}
              type="number"
              value={newDraft.base_price}
              onChange={e => setNewDraft({ ...newDraft, base_price: Number(e.target.value) })}
              className="font-mono"
            />
          </Field>
          {isService && extras.kind === 'item' && (
            <>
              <Field label="Satuan" htmlFor="rule-new-unit">
                <Input id="rule-new-unit" placeholder="unit, titik, m²" value={extras.unit_label} onChange={(e) => setExtras({ ...extras, unit_label: e.target.value })} />
              </Field>
              <Field label="Jumlah maksimal per pesanan" htmlFor="rule-new-max">
                <Input id="rule-new-max" type="number" min={1} max={50} value={extras.max_qty} onChange={(e) => setExtras({ ...extras, max_qty: e.target.value })} className="font-mono" />
              </Field>
              <Field label="Keterangan untuk pelanggan" htmlFor="rule-new-desc" className="sm:col-span-2">
                <Textarea id="rule-new-desc" rows={2} maxLength={160} value={extras.description} onChange={(e) => setExtras({ ...extras, description: e.target.value })} />
              </Field>
            </>
          )}
          {showPerKmRate && (
            <Field label="Tarif/km (Rp)" htmlFor={`rule-new-perkm-${serviceType}`}>
              <Input
                id={`rule-new-perkm-${serviceType}`}
                type="number"
                value={newDraft.per_km_rate}
                onChange={e => setNewDraft({ ...newDraft, per_km_rate: Number(e.target.value) })}
                className="font-mono"
              />
            </Field>
          )}
        </div>
      </Sheet>
    </Card>
  );
};

export default PricingRulesSection;
