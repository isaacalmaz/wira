import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ConciergeBell } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, Input, Money } from '../ui';
import { submitVillaRequestQuote } from '../../services/stage4Service';
import { friendlyError } from '../../utils/friendlyError';

const LABELS = {
  early_checkin: 'Check-in lebih awal',
  late_checkout: 'Check-out lebih lambat',
  extra_bed: 'Extra bed',
  airport_pickup: 'Jemput dari bandara',
  other: 'Permintaan lain',
};
const STATUS = { pending: ['Menunggu tamu', 'warning'], approved: ['Disetujui tamu', 'success'], rejected: ['Ditolak tamu', 'danger'], cancelled: ['Dibatalkan', 'neutral'] };

/**
 * Villa host prices the guest's special requests (migrations/0132). Each
 * request can be priced (0 = free) or marked unavailable; the guest approves
 * or rejects the total in the app. On a QRIS-paid booking the guest pays it
 * in cash on arrival, and the villa commission on it is recorded at checkout.
 */
export default function VillaRequestQuote({ order }) {
  const requests = Array.isArray(order.metadata?.villa_requests) ? order.metadata.villa_requests : [];
  const [adj, setAdj] = useState(null);
  const [form, setForm] = useState({});
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('order_adjustments').select('*')
      .eq('order_id', order.id).eq('kind', 'villa').order('created_at', { ascending: false }).limit(1);
    setAdj(data?.[0] || null);
  }, [order.id]);

  useEffect(() => { if (requests.length) load(); }, [requests.length, load]);

  if (requests.length === 0) return null;
  const canQuote = ['pending', 'accepted'].includes(order.status) && (!adj || adj.status === 'rejected' || adj.status === 'cancelled');
  const value = (code) => form[code] || { amount: '', available: true };
  const total = requests.reduce((sum, r) => sum + (value(r.code).available ? Number(String(value(r.code).amount).replace(/\D/g, '')) || 0 : 0), 0);

  const send = async () => {
    setSending(true);
    try {
      const items = requests.map((r) => ({
        code: r.code,
        available: value(r.code).available,
        amount: value(r.code).available ? Number(String(value(r.code).amount).replace(/\D/g, '')) || 0 : 0,
      }));
      await submitVillaRequestQuote(supabase, order.id, items);
      toast.success('Harga permintaan khusus dikirim ke tamu');
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className={canQuote ? 'flex flex-col gap-3 border-2 border-brand' : 'flex flex-col gap-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <ConciergeBell size={17} className="text-brand-ink" aria-hidden="true" />
          Permintaan khusus tamu
        </p>
        {adj && STATUS[adj.status] && <Badge tone={STATUS[adj.status][1]}>{STATUS[adj.status][0]}</Badge>}
      </div>
      <ul className="flex flex-col gap-3">
        {requests.map((r) => {
          const quoted = Array.isArray(adj?.details) ? adj.details.find((d) => d.code === r.code) : null;
          return (
            <li key={r.code} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 text-ink">{LABELS[r.code] || r.code}{r.note ? <span className="text-ink-muted"> · {r.note}</span> : null}</span>
                {quoted && !canQuote && (
                  <span className="shrink-0">{quoted.available === false ? 'Tidak tersedia' : Number(quoted.amount) === 0 ? 'Gratis' : <Money value={Number(quoted.amount)} />}</span>
                )}
              </div>
              {canQuote && (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Harga ${LABELS[r.code] || r.code}`}
                    inputMode="numeric"
                    placeholder="0 = gratis"
                    disabled={!value(r.code).available}
                    value={value(r.code).amount ? Number(String(value(r.code).amount).replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                    onChange={(e) => setForm((f) => ({ ...f, [r.code]: { ...value(r.code), amount: e.target.value.replace(/\D/g, '').slice(0, 9) } }))}
                    className="font-mono"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink">
                    <input
                      type="checkbox"
                      checked={!value(r.code).available}
                      onChange={(e) => setForm((f) => ({ ...f, [r.code]: { ...value(r.code), available: !e.target.checked } }))}
                    />
                    Tidak bisa
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canQuote && (
        <>
          <Button onClick={send} isLoading={sending}>Kirim harga ke tamu · <Money value={total} /></Button>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {order.payment_method === 'cash'
              ? 'Kalau disetujui, harga ini ditambahkan ke total reservasi.'
              : 'Reservasi sudah dibayar lewat QRIS. Kalau disetujui, tamu membayar ini tunai saat tiba; komisi villa atas biaya tambahan dicatat saat reservasi selesai.'}
          </p>
        </>
      )}
      {adj?.status === 'approved' && Number(adj.amount) > 0 && (
        <p className="text-[13px] font-semibold text-ink">
          {order.payment_method === 'cash' ? 'Sudah masuk total reservasi: ' : 'Terima tunai dari tamu saat tiba: '}<Money value={Number(adj.amount)} />
        </p>
      )}
    </Card>
  );
}
