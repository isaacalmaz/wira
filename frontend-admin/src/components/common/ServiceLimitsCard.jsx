import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Card, Field, IconTile, Input } from '../ui';

// app_settings keys from migrations/0128, 0132 and 0133 (ranges are checked by
// admin_set_app_setting on the server too).
const SETTINGS = [
  { key: 'titip_budget_max', label: 'Batas belanja titip beli', unit: 'Rp', hint: 'Rp 10.000 – 5.000.000. Batas talangan driver per pesanan.', fallback: 300000 },
  // migrations/0133: lower limit until a customer has enough completed orders.
  { key: 'titip_budget_new_max', label: 'Batas belanja titip beli: pelanggan baru', unit: 'Rp', hint: 'Rp 10.000 – 5.000.000. Tidak pernah di atas batas biasa.', fallback: 100000 },
  { key: 'titip_trusted_orders', label: 'Pelanggan baru sampai punya', unit: 'pesanan', hint: '0 – 50 pesanan selesai (semua layanan). 0 = semua pelanggan pakai batas biasa.', fallback: 3, zeroOk: true },
  { key: 'titip_auto_approve_minutes', label: 'Struk titip beli disetujui otomatis setelah', unit: 'menit', hint: '5 – 240 menit tanpa jawaban pelanggan.', fallback: 30 },
  { key: 'big_item_quote_min', label: 'Harga minimum barang besar', unit: 'Rp', hint: 'Penawaran driver mobil tidak boleh di bawah ini.', fallback: 30000 },
  { key: 'big_item_quote_max', label: 'Harga maksimum barang besar', unit: 'Rp', hint: 'Penawaran driver mobil tidak boleh di atas ini.', fallback: 1000000 },
  { key: 'visit_quote_max', label: 'Batas penawaran teknisi (Pekerjaan lain)', unit: 'Rp', hint: 'WiraService dan WiraPool. Di atas ini, pelanggan diarahkan ke admin.', fallback: 5000000 },
  // Stage 4 (migrations/0132). Hourly prices per vehicle are in the WiraRide table below.
  { key: 'ride_hourly_min_hours', group: 'Ride Nanti & Per jam', label: 'Sewa per jam: paling singkat', unit: 'jam', hint: '1 – 24 jam.', fallback: 2 },
  { key: 'ride_hourly_max_hours', group: 'Ride Nanti & Per jam', label: 'Sewa per jam: paling lama', unit: 'jam', hint: '1 – 24 jam, tidak di bawah yang paling singkat.', fallback: 12 },
  { key: 'ride_hourly_grace_minutes', group: 'Ride Nanti & Per jam', label: 'Toleransi sebelum lewat waktu dihitung', unit: 'menit', hint: '0 – 60 menit. Setelah itu dihitung per 30 menit, setengah tarif per jam.', fallback: 10, zeroOk: true },
  { key: 'ride_schedule_min_minutes', group: 'Ride Nanti & Per jam', label: 'Pesan "Nanti": paling cepat', unit: 'menit', hint: '15 – 1440 menit dari sekarang.', fallback: 60 },
  { key: 'ride_schedule_max_days', group: 'Ride Nanti & Per jam', label: 'Pesan "Nanti": paling jauh', unit: 'hari', hint: '1 – 30 hari ke depan.', fallback: 7 },
  { key: 'ride_schedule_free_cancel_hours', group: 'Ride Nanti & Per jam', label: 'Batal tanpa catatan sampai', unit: 'jam', hint: '0 – 48 jam sebelum jadwal. Batal setelahnya tetap boleh, tapi dicatat (sopir masuk Penanda Mitra).', fallback: 2, zeroOk: true },
  { key: 'ride_schedule_queue_minutes', group: 'Ride Nanti & Per jam', label: 'Kirim ke semua sopir dan beri tahu admin', unit: 'menit', hint: '5 – 180 menit sebelum jadwal kalau belum ada sopir.', fallback: 30 },
  { key: 'service_warranty_days', group: 'Garansi & Villa', label: 'Garansi WiraService', unit: 'hari', hint: '0 – 90 hari sejak selesai. 0 = garansi dimatikan.', fallback: 7, zeroOk: true },
  { key: 'pool_warranty_hours', group: 'Garansi & Villa', label: 'Garansi air jernih: kunjungan ulang paling lambat', unit: 'jam', hint: '12 – 168 jam. Lewat dari ini admin diberi tahu.', fallback: 48 },
  { key: 'warranty_response_hours', group: 'Garansi & Villa', label: 'Batas teknisi menjawab klaim', unit: 'jam', hint: '1 – 72 jam. Lewat dari ini klaim masuk menu Garansi.', fallback: 24 },
  { key: 'villa_request_max', group: 'Garansi & Villa', label: 'Harga maksimal per permintaan khusus villa', unit: 'Rp', hint: 'Rp 0 – 20.000.000. 0 = tuan rumah hanya bisa memberi gratis.', fallback: 2000000, zeroOk: true },
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
    const digits = String(draft[key] || '').replace(/\D/g, '');
    const n = Number(digits);
    const zeroOk = SETTINGS.find((s) => s.key === key)?.zeroOk;
    if (digits === '' || (!n && !zeroOk)) { toast.error('Isi angka yang valid'); return; }
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
            Titip beli, barang besar, penawaran teknisi, ride terjadwal dan per jam, garansi, dan permintaan villa. Tarif sewa per jam ada di tabel WiraRide. Ongkir titip beli diatur di tabel WiraSend (kode TITIP), komisinya di menu Komisi.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SETTINGS.map((s, i) => {
          const dirty = String(values[s.key]) !== String(draft[s.key] || '').replace(/\D/g, '');
          return (
            <div key={s.key} className={s.group && s.group !== SETTINGS[i - 1]?.group ? 'flex flex-col gap-3 md:col-span-2' : 'contents'}>
            {s.group && s.group !== SETTINGS[i - 1]?.group && (
              <h3 className="border-t border-line pt-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">{s.group}</h3>
            )}
            <Field label={s.label} htmlFor={`setting-${s.key}`} hint={s.hint}>
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
            </div>
          );
        })}
      </div>
    </Card>
  );
}
