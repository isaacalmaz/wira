import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Card, IconTile, Segmented, Select } from '../ui';

const WINDOWS = [30, 60, 90, 120, 180];

/**
 * How QRIS payments are confirmed (app_settings, migrations/0108):
 * by hand here in Keuangan, or automatically by the Mutasiku webhook.
 * Admins get a notification for every waiting top-up either way.
 */
export default function PaymentModeCard() {
  const [auto, setAuto] = useState(null);
  const [windowMin, setWindowMin] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', ['topup_auto_confirm', 'qris_order_window_minutes'])
      .then(({ data, error }) => {
        if (error) { setAuto(false); return; }
        const get = (k) => data?.find((r) => r.key === k)?.value;
        setAuto(get('topup_auto_confirm') === true);
        if (Number(get('qris_order_window_minutes')) > 0) setWindowMin(Number(get('qris_order_window_minutes')));
      });
  }, []);

  const save = async (key, value, apply) => {
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_app_setting', { p_key: key, p_value: value });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    apply();
    toast.success('Pengaturan disimpan');
  };

  if (auto === null) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconTile tone="brand" size="sm"><ShieldCheck size={18} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Konfirmasi pembayaran QRIS</h2>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {auto
              ? 'Otomatis: transfer yang cocok di Mutasiku langsung disetujui. Sisanya tetap muncul di bawah untuk dicek manual.'
              : 'Manual: setiap top-up dan pembayaran pesanan menunggu Anda. Cek mutasi di DANA/bank, lalu setujui di daftar di bawah. Admin mendapat notifikasi setiap ada yang masuk.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          size="sm"
          ariaLabel="Mode konfirmasi"
          options={[{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Otomatis (Mutasiku)' }]}
          value={auto ? 'auto' : 'manual'}
          onChange={(v) => { if (!saving && (v === 'auto') !== auto) save('topup_auto_confirm', v === 'auto', () => setAuto(v === 'auto')); }}
        />
        <label htmlFor="qris-window" className="flex items-center gap-2 text-[13px] text-ink-muted">
          Batas bayar pesanan QRIS
          <Select
            id="qris-window"
            value={windowMin}
            disabled={saving}
            onChange={(e) => { const n = Number(e.target.value); save('qris_order_window_minutes', n, () => setWindowMin(n)); }}
            className="w-auto"
          >
            {WINDOWS.map((m) => <option key={m} value={m}>{m} menit</option>)}
          </Select>
        </label>
      </div>
    </Card>
  );
}
