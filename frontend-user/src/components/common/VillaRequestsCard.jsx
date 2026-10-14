import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ConciergeBell } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, Money, Notice } from '../ui';
import { friendlyError } from '../../utils/friendlyError';

const SLOT = '\u0000';
function withMoney(text, value) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} />{after}</>;
}

/**
 * Villa special requests (migrations/0132): what the guest asked for, the
 * host's prices, and approve/reject. On a QRIS-paid booking the approved
 * amount is paid in cash to the host on arrival.
 */
export default function VillaRequestsCard({ order }) {
  const { t } = useTranslation();
  const [adj, setAdj] = useState(null);
  const [busy, setBusy] = useState(null);
  const requests = Array.isArray(order.metadata?.villa_requests) ? order.metadata.villa_requests : [];

  const load = useCallback(async () => {
    const { data } = await supabase.from('order_adjustments').select('*')
      .eq('order_id', order.id).eq('kind', 'villa').order('created_at', { ascending: false }).limit(1);
    setAdj(data?.[0] || null);
  }, [order.id]);

  useEffect(() => {
    if (requests.length === 0) return undefined;
    load();
    const channel = supabase
      .channel(`villa-req-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, requests.length, load]);

  if (requests.length === 0) return null;

  const respond = async (approve) => {
    setBusy(approve);
    try {
      const { data, error } = await supabase.rpc('respond_order_adjustment', { p_adjustment_id: adj.id, p_approve: approve });
      if (error) throw error;
      toast.success(data === 'approved' ? t('villareq.approved') : t('villareq.rejected'));
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const items = Array.isArray(adj?.details) ? adj.details : null;
  const cashOnArrival = order.payment_method !== 'cash';
  const open = ['pending', 'accepted'].includes(order.status);

  return (
    <Card className={adj?.status === 'pending' && open ? 'flex flex-col gap-3 border-2 border-brand' : 'flex flex-col gap-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <ConciergeBell size={17} className="text-brand-ink" aria-hidden="true" />
          {t('villareq.title')}
        </p>
        {adj && <Badge tone={adj.status === 'approved' ? 'success' : adj.status === 'pending' ? 'warning' : 'neutral'}>{t(`villareq.status_${adj.status}`)}</Badge>}
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        {(items || requests).map((r) => (
          <li key={r.code} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-ink">
              {t(`villareq.code_${r.code}`)}
              {r.note ? <span className="text-ink-muted"> · {r.note}</span> : null}
            </span>
            {items && (
              <span className="shrink-0">
                {r.available === false ? <span className="text-ink-muted">{t('villareq.unavailable')}</span>
                  : Number(r.amount) === 0 ? <span className="text-ink-muted">{t('villareq.free')}</span>
                    : <Money value={Number(r.amount)} />}
              </span>
            )}
          </li>
        ))}
      </ul>
      {!adj && open && <Notice tone="info">{t('villareq.waiting_host')}</Notice>}
      {adj?.status === 'pending' && open && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => respond(false)} isLoading={busy === false} disabled={busy !== null}>{t('villareq.reject')}</Button>
            <Button onClick={() => respond(true)} isLoading={busy === true} disabled={busy !== null}>
              {withMoney(t('villareq.approve', { amount: SLOT }), Number(adj.amount))}
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-muted">{t('villareq.reject_note')}</p>
        </>
      )}
      {adj?.status === 'approved' && Number(adj.amount) > 0 && (
        <p className="text-[13px] font-semibold text-ink">
          {withMoney(t(cashOnArrival ? 'villareq.pay_on_arrival' : 'villareq.added_to_total', { amount: SLOT }), Number(adj.amount))}
        </p>
      )}
    </Card>
  );
}
