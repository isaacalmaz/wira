import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Card, Field, IconTile, Input } from '../ui';

// app_settings keys from migrations/0128 (ranges are checked by
// admin_set_app_setting on the server too).
const SETTINGS = [
  { key: 'titip_budget_max', label: 'Batas belanja titip beli', unit: 'Rp', hint: 'Rp 10.000 – 5.000.000. Batas talangan driver per pesanan.', fallback: 300000 },
  { key: 'titip_auto_approve_minutes', label: 'Struk titip beli disetujui otomatis setelah', unit: 'menit', hint: '5 – 240 menit tanpa jawaban pelanggan.', fallback: 30 },
  { key: 'big_item_quote_min', label: 'Harga minimum barang besar', unit: 'Rp', hint: 'Penawaran driver mobil tidak boleh di bawah ini.', fallback: 30000 },
  { key: 'big_item_quote_max', label: 'Harga maksimum barang besar', unit: 'Rp', hint: 'Penawaran driver mobil tidak boleh di atas ini.', fallback: 1000000 },
  { key: 'visit_quote_max', label: 'Batas penawaran teknisi (Pekerjaan lain)', unit: 'Rp', hint: 'WiraService dan WiraPool. Di atas ini, pelanggan diarahkan ke admin.', fallback: 5000000 },
];

const fmt = (n) => (n === '' || n == null ? '' : Number(n).toLocaleString('id-ID'));

/**
 * Limits for the free-form orders (titip beli, barang besar, on-site
 * quotes). Prices themselves live in the tables below (send/TITIP is the
 * titip beli delivery fee) and commission in the Komisi menu.
 */
export default function ServiceLimitsCard() {
  const [values, setValues] = useState(null); // { key: number }
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', SETTINGS.map((s) => s.key))
      .then(({ data }) => {
        const v = Object.fromEntries(SETTINGS.map((s) => [s.key, Number(data?.find((r) => r.key === s.key)?.value ?? s.fallback)]));
        setValues(v);
        setDraft(Object.fromEntries(Object.entries(v).map(([k, n]) => [k, String(n)])));
      });
  }, []);

  const save = async (key) => {
    const n = Number(String(draft[key] || '').replace(/\D/g, ''));
    if (!n) { toast.error('Isi angka yang valid'); return; }
    setSaving(key);
    const { error } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: n });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setValues((v) => ({ ...v, [key]: n }));
    toast.success('Pengaturan disimpan');
  };

  if (!values) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconTile tone="brand" size="sm"><SlidersHorizontal size={18} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Aturan pesanan bebas</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Titip beli, barang besar, dan penawaran teknisi. Ongkir titip beli diatur di tabel WiraSend (kode TITIP), komisinya di menu Komisi.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SETTINGS.map((s) => {
          const dirty = String(values[s.key]) !== String(draft[s.key] || '').replace(/\D/g, '');
          return (
            <Field key={s.key} label={s.label} htmlFor={`setting-${s.key}`} hint={s.hint}>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  {s.unit === 'Rp' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">Rp</span>}
                  <Input
                    id={`setting-${s.key}`}
                    inputMode="numeric"
                    value={fmt(String(draft[s.key] || '').replace(/\D/g, ''))}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                    className={s.unit === 'Rp' ? 'pl-9 font-mono' : 'font-mono'}
                  />
                  {s.unit !== 'Rp' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted">{s.unit}</span>}
                </div>
                <Button variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || saving === s.key} isLoading={saving === s.key} onClick={() => save(s.key)}>
                  Simpan
                </Button>
              </div>
            </Field>
          );
        })}
      </div>
    </Card>
  );
}
