import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Timer } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, Money } from '../ui';
import { respondRideExtension } from '../../services/stage4Service';
import { friendlyError } from '../../utils/friendlyError';

function formatLeft(ms) {
  const total = Math.floor(Math.abs(ms) / 60000);
  return `${ms < 0 ? '-' : ''}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Driver side of a WiraRide hourly hire (migrations/0132): time left, the
 * customer's requests for more time, and the overtime rule.
 */
export default function RideHourlyTools({ order, onChanged }) {
  const hourly = order.metadata?.hourly;
  const [adjustments, setAdjustments] = useState([]);
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data } = await supabase.from('order_adjustments').select('*').eq('order_id', order.id).eq('kind', 'sewa').order('created_at');
    setAdjustments(data || []);
  }, [order.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`ride-hourly-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { supabase.removeChannel(channel); clearInterval(tick); };
  }, [order.id, load]);

  if (!hourly) return null;
  const bookedMin = Number(hourly.hours || 0) * 60 + Number(hourly.extra_minutes || 0);
  const startedMs = order.status === 'in_trip' && order.status_changed_at ? new Date(order.status_changed_at).getTime() : null;
  const leftMs = startedMs ? startedMs + bookedMin * 60000 - now : null;
  const pending = adjustments.find((a) => a.status === 'pending');

  const answer = async (approve) => {
    setBusy(approve);
    try {
      const res = await respondRideExtension(supabase, pending.id, approve);
      toast.success(res === 'approved' ? 'Tambah waktu disetujui' : res === 'rejected' ? 'Permintaan ditolak' : 'Permintaan sudah tidak berlaku');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <Timer size={17} className="text-brand-ink" aria-hidden="true" />
          Sewa {hourly.hours} jam
        </p>
        {Number(hourly.extra_minutes) > 0 && <Badge tone="pay">+{hourly.extra_minutes} menit</Badge>}
      </div>
      {leftMs != null && (
        <p className="text-[13.5px] font-semibold text-ink">{leftMs >= 0 ? `Sisa waktu ${formatLeft(leftMs)}` : `Lewat waktu ${formatLeft(-leftMs)}`}</p>
      )}
      {hourly.plan && <p className="break-words text-[13px] text-ink-muted">Rencana pelanggan: {hourly.plan}</p>}
      {pending && (
        <div className="flex flex-col gap-2 rounded-tile border-2 border-brand p-3">
          <p className="text-[13.5px] font-semibold text-ink">Pelanggan minta {pending.description.toLowerCase()} · <Money value={Number(pending.amount)} /></p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => answer(false)} isLoading={busy === false} disabled={busy !== null}>Tidak bisa</Button>
            <Button onClick={() => answer(true)} isLoading={busy === true} disabled={busy !== null}>Setuju</Button>
          </div>
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Waktu dihitung sejak PIN dimasukkan. Lewat waktu dihitung otomatis per 30 menit (setengah tarif per jam) saat Anda menekan Selesaikan Sewa. Bensin di Lombok termasuk.
      </p>
    </Card>
  );
}
