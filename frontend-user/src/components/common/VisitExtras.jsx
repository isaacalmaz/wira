import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ClipboardList, ReceiptText } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, Money, Notice, cx } from '../ui';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { friendlyError } from '../../utils/friendlyError';

// Drops a <Money> into a translated sentence at {{amount}} / {{fee}}.
const SLOT = '\u0000';
function withMoney(text, value) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} />{after}</>;
}

/**
 * Technician visit details on the customer's order page (migrations/0090):
 * what was booked (itemised menu), which visit of a monthly package this is,
 * and the technician's extra-charge requests, which the customer approves
 * or rejects here.
 */
export default function VisitExtras({ order }) {
  const { t } = useTranslation();
  const [adjustments, setAdjustments] = useState([]);
  const [busy, setBusy] = useState(null); // `${id}:approve|reject`

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('order_adjustments')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at');
    if (!error) setAdjustments(data || []);
  }, [order.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`order-adjustments-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, load]);

  const respond = async (adj, approve) => {
    setBusy(`${adj.id}:${approve ? 'approve' : 'reject'}`);
    try {
      const { error } = await supabase.rpc('respond_order_adjustment', { p_adjustment_id: adj.id, p_approve: approve });
      if (error) throw error;
      toast.success(approve ? t('visit.adjust_approved') : t('visit.adjust_rejected'));
      load();
    } catch (err) {
      toast.error(friendlyError(err) || t('visit.adjust_failed'));
    } finally {
      setBusy(null);
    }
  };

  const items = Array.isArray(order.metadata?.items) ? order.metadata.items : [];
  const visitNo = order.metadata?.package_visit;
  const paidOnline = ['wallet', 'qris'].includes(order.payment_method) && order.payment_status === 'paid';
  const pending = adjustments.filter((a) => a.status === 'pending');
  const decided = adjustments.filter((a) => a.status === 'approved');
  const active = ['on_the_way', 'working'].includes(order.status);
  // "Pekerjaan lain" (migrations/0123): the technician's on-site quote.
  const job = order.metadata?.job || null;
  const jobBase = Number(job?.base || 0);
  const quoteApproved = adjustments.some((a) => a.kind === 'quote' && a.status === 'approved');
  const awaitingQuote = !!job && !quoteApproved && !pending.some((a) => a.kind === 'quote')
    && ['accepted', 'on_the_way'].includes(order.status);

  if (items.length === 0 && !visitNo && adjustments.length === 0) return null;

  return (
    <>
      {awaitingQuote && <Notice tone="info">{t('visit.quote_waiting')}</Notice>}

      {active && pending.filter((adj) => adj.kind === 'quote').map((adj) => (
        <Card key={adj.id} className="flex flex-col gap-3 border-2 border-brand">
          <div className="flex items-start gap-3">
            <ReceiptText size={20} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[14px] font-bold text-ink">{t('visit.quote_title')}</p>
              <p className="break-words text-[13px] leading-relaxed text-ink">{adj.description}</p>
            </div>
          </div>
          <dl className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">{t('visit.quote_work')}</dt>
              <dd><Money value={Number(adj.amount) + jobBase} className="text-ink" /></dd>
            </div>
            {jobBase > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">{t('visit.quote_check')}</dt>
                <dd className="text-success-ink">− <Money value={jobBase} /></dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 font-semibold">
              <dt className="text-ink">{t('visit.quote_rest')}</dt>
              <dd><Money value={Number(adj.amount)} className="text-[15px] text-ink" /></dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => respond(adj, false)} isLoading={busy === `${adj.id}:reject`} disabled={!!busy}>
              {t('visit.reject')}
            </Button>
            <Button onClick={() => respond(adj, true)} isLoading={busy === `${adj.id}:approve`} disabled={!!busy}>
              {withMoney(t('visit.quote_approve', { amount: SLOT }), Number(adj.amount) + jobBase)}
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            {jobBase > 0
              ? withMoney(t('visit.quote_reject_check', { fee: SLOT }), jobBase)
              : t('visit.quote_reject_combined')}
          </p>
        </Card>
      ))}

      {active && pending.filter((adj) => adj.kind !== 'quote').map((adj) => (
        <Card key={adj.id} className="flex flex-col gap-3 border-2 border-warning-line">
          <div className="flex items-start gap-3">
            <ReceiptText size={20} className="mt-0.5 shrink-0 text-warning-ink" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[14px] font-bold text-ink">{t('visit.adjust_title')}</p>
              <p className="break-words text-[13px] leading-relaxed text-ink">{adj.description}</p>
              <Badge tone="neutral" className="self-start">{adj.kind === 'material' ? t('visit.kind_material') : t('visit.kind_work')}</Badge>
            </div>
            <Money value={Number(adj.amount)} className="shrink-0 text-[17px] font-medium text-ink" />
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {paidOnline ? t('visit.adjust_pay_wallet') : t('visit.adjust_pay_cash')}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => respond(adj, false)} isLoading={busy === `${adj.id}:reject`} disabled={!!busy}>
              {t('visit.reject')}
            </Button>
            <Button onClick={() => respond(adj, true)} isLoading={busy === `${adj.id}:approve`} disabled={!!busy}>
              {t('visit.approve')}
            </Button>
          </div>
        </Card>
      ))}

      {(items.length > 0 || visitNo || decided.length > 0) && (
        <Card className="flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <ClipboardList size={16} className="text-ink-muted" aria-hidden="true" />
            {visitNo ? t('visit.package_visit', { n: visitNo, total: order.metadata?.package_size || 4 }) : t('visit.booked_work')}
          </p>
          {items.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {items.map((it) => (
                <li key={it.code} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-ink">
                    <span className="font-mono text-ink-muted">{it.qty}×</span> {it.name}
                  </span>
                  <Money value={Number(it.price) * Number(it.qty)} className="shrink-0 text-ink" />
                </li>
              ))}
            </ul>
          )}
          {job && (
            <div className={cx('flex flex-col gap-2 text-[13px]', items.length > 0 && 'border-t border-line pt-2.5')}>
              <p className="font-semibold text-ink">{t('visit.job_label')}</p>
              <p className="break-words leading-relaxed text-ink">{job.description}</p>
              <OrderPhotoThumbs paths={job.photos} label={t('visit.photos_label')} />
            </div>
          )}
          {decided.length > 0 && (
            <ul className={cx('flex flex-col gap-1.5 text-[13px]', items.length > 0 && 'border-t border-line pt-2.5')}>
              {decided.map((adj) => (
                <li key={adj.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-ink">
                    {adj.kind === 'quote' ? t('visit.quote_approved') : t('visit.extra')}: {adj.description}
                  </span>
                  <Money value={Number(adj.amount)} className="shrink-0 text-ink" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
