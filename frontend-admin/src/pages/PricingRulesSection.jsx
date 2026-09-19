import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';

// Presentational, per-service_type editable table for public.pricing_rules.
// All Supabase calls (fetch/update/insert/delete) and the RLS-trap check
// live in the parent (VehiclesPricingPage) so both this table and the
// vehicles table share one proven mutation pattern - this component just
// renders rows and forwards intent (save/delete/create) upward.
const emptyDraft = { code: '', name: '', base_price: 0, per_km_rate: 0, is_active: true };

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

  const colSpan = showPerKmRate ? 6 : 5;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-700">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="flex items-center gap-1 text-sm text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/10 shrink-0"
        >
          <Plus size={16} /> Tambah
        </button>
      </div>

      {showNewForm && (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
          <input
            placeholder="Kode (mis. kecil)"
            value={newDraft.code}
            onChange={e => setNewDraft({ ...newDraft, code: e.target.value })}
            className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
          />
          <input
            placeholder="Nama tampilan"
            value={newDraft.name}
            onChange={e => setNewDraft({ ...newDraft, name: e.target.value })}
            className="col-span-2 px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
          />
          <input
            type="number"
            placeholder="Harga dasar"
            value={newDraft.base_price}
            onChange={e => setNewDraft({ ...newDraft, base_price: Number(e.target.value) })}
            className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
          />
          {showPerKmRate && (
            <input
              type="number"
              placeholder="Tarif/km"
              value={newDraft.per_km_rate}
              onChange={e => setNewDraft({ ...newDraft, per_km_rate: Number(e.target.value) })}
              className="px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            />
          )}
          <div className="col-span-2 sm:col-span-5 flex gap-2 justify-end">
            <button
              onClick={() => { setShowNewForm(false); setNewDraft(emptyDraft); }}
              className="px-4 py-2 rounded-lg border dark:border-slate-700 flex items-center gap-1"
            >
              <X size={16} /> Batal
            </button>
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-primary text-white flex items-center gap-1">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
            <tr>
              <th className="p-4 font-semibold">Kode</th>
              <th className="p-4 font-semibold">Nama</th>
              <th className="p-4 font-semibold">Harga Dasar</th>
              {showPerKmRate && <th className="p-4 font-semibold">Tarif/km</th>}
              <th className="p-4 font-semibold">Aktif</th>
              <th className="p-4 font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map(r => (
              <tr key={r.id} className={isDirty(r.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                <td className="p-4 text-slate-500">{r.code}</td>
                <td className="p-4">
                  <input
                    value={getField(r, 'name') || ''}
                    onChange={e => setField(r.id, 'name', e.target.value)}
                    className="w-40 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                  />
                </td>
                <td className="p-4">
                  <input
                    type="number"
                    value={getField(r, 'base_price')}
                    onChange={e => setField(r.id, 'base_price', Number(e.target.value))}
                    className="w-28 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                  />
                </td>
                {showPerKmRate && (
                  <td className="p-4">
                    <input
                      type="number"
                      value={getField(r, 'per_km_rate')}
                      onChange={e => setField(r.id, 'per_km_rate', Number(e.target.value))}
                      className="w-24 px-2 py-1 rounded border dark:bg-slate-900 dark:border-slate-700"
                    />
                  </td>
                )}
                <td className="p-4">
                  <input
                    type="checkbox"
                    checked={!!getField(r, 'is_active')}
                    onChange={e => setField(r.id, 'is_active', e.target.checked)}
                    className="w-4 h-4"
                  />
                </td>
                <td className="p-4 flex gap-2">
                  <button
                    disabled={!isDirty(r.id)}
                    onClick={() => onSave(r)}
                    className="p-1.5 text-primary disabled:text-slate-300 disabled:cursor-not-allowed hover:bg-primary/10 rounded-lg transition"
                    title="Simpan perubahan"
                  >
                    <Save size={16} />
                  </button>
                  <button onClick={() => onDelete(r)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="p-8 text-center text-slate-500">Belum ada tarif untuk layanan ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PricingRulesSection;
