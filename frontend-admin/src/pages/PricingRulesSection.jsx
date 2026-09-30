import { useState, useCallback } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button, Card, Field, Input, Sheet, cx } from '../components/ui';

// Presentational, per-service_type editable table for public.pricing_rules.
// All Supabase calls (fetch/update/insert/delete) and the RLS-trap check
// live in the parent (VehiclesPricingPage) so both this table and the
// vehicles table share one proven mutation pattern - this component just
// renders rows and forwards intent (save/delete/create) upward.
const emptyDraft = { code: '', name: '', base_price: 0, per_km_rate: 0, is_active: true };

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

  const handleCreate = async () => {
    if (!newDraft.code || !newDraft.name) return;
    const ok = await onCreate({ ...newDraft, service_type: serviceType });
    if (ok) {
      setNewDraft(emptyDraft);
      setShowNewForm(false);
    }
  };

  // Stable so the Sheet doesn't re-run its focus effect on every keystroke.
  const cancelNew = useCallback(() => { setShowNewForm(false); setNewDraft(emptyDraft); }, []);

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

      <div className="overflow-x-auto">
        <table className="data-table">
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
                  <td className="whitespace-nowrap font-mono text-[12.5px] text-ink-muted">{r.code}</td>
                  <td>
                    <input
                      aria-label={`Nama ${r.code}`}
                      value={getField(r, 'name') || ''}
                      onChange={e => setField(r.id, 'name', e.target.value)}
                      className={cx(cellInputClass, 'w-48')}
                    />
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
        </table>
      </div>

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
