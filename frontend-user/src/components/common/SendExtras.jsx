import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ReceiptText, ShoppingBasket, Truck, MessageCircle } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, Money, Notice, cx } from '../ui';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { friendlyError } from '../../utils/friendlyError';

const SLOT = '\u0000';
function withMoney(text, value) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} />{after}</>;
}

function Row({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 text-[13px]', strong && 'border-t border-line pt-1.5 font-semibold', className)}>
      <dt className={strong ? 'text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

/**
 * Customer side of the two free-form send orders (migrations/0128):
 *   - Titip beli: the shopping list, then the driver's receipt to approve
 *     (it cannot be rejected; after the admin-set minutes it is approved
 *     automatically).
 *   - Barang besar: the item and the car driver's quote; rejecting it
 *     cancels the order at no charge.
 */
export default function SendExtras({ order, onChat }) {
  const { t } = useTranslation();
  const [adjustments, setAdjustments] = useState([]);
  const [busy, setBusy] = useState(null);
  const [autoMinutes, setAutoMinutes] = useState(30);
  const titip = order.metadata?.titip || null;
  const job = order.metadata?.job || null;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('order_adjustments').select('*').eq('order_id', order.id).order('created_at');
    if (!error) setAdjustments(data || []);
  }, [order.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`send-adjustments-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, load]);

  useEffect(() => {
    if (!titip) return;
    supabase.from('app_settings').select('value').eq('key', 'titip_auto_approve_minutes').maybeSingle()
      .then(({ data }) => { if (data && Number(data.value) > 0) setAutoMinutes(Number(data.value)); });
  }, [titip]);

  const respond = async (adj, approve) => {
    setBusy(`${adj.id}:${approve}`);
    try {
      const { data, error } = await supabase.rpc('respond_order_adjustment', { p_adjustment_id: adj.id, p_approve: approve });
      if (error) throw error;
      if (data === 'rejected') toast.success(t('big.rejected'));
      else if (data === 'approved') toast.success(adj.kind === 'belanja' ? t('titip.receipt_approved') : t('big.approved'));
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const receipt = adjustments.find((a) => a.kind === 'belanja' && ['pending', 'approved'].includes(a.status));
  const quote = adjustments.find((a) => a.kind === 'quote' && ['pending', 'approved'].includes(a.status));
  // Before the receipt is approved total_price is the delivery fee alone.
  const fee = Number(order.total_price || 0) - (receipt?.status === 'approved' ? Number(receipt.amount) : 0);

  if (titip) {
    return (
      <>
        {receipt?.status === 'pending' && order.status === 'picking_up' && (
          <Card className="flex flex-col gap-3 border-2 border-brand">
            <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
              <ReceiptText size={18} className="text-brand-ink" aria-hidden="true" />
              {t('titip.receipt_title')}
            </p>
            <OrderPhotoThumbs paths={receipt.photos} label={t('titip.receipt_photo')} />
            <p className="break-words text-[13px] leading-relaxed text-ink">{receipt.description}</p>
            <dl className="flex flex-col gap-1.5">
              <Row label={t('titip.receipt_goods')}><Money value={Number(receipt.amount)} /></Row>
              <Row label={t('titip.fee')}><Money value={fee} /></Row>
              <Row label={t('titip.pay_cash')} strong><Money value={Number(receipt.amount) + fee} className="text-[15px]" /></Row>
            </dl>
            <div className="flex flex-col gap-2">
              <Button onClick={() => respond(receipt, true)} isLoading={busy === `${receipt.id}:true`} disabled={!!busy}>{t('titip.receipt_approve')}</Button>
              {onChat && <Button variant="secondary" leftIcon={<MessageCircle size={16} />} onClick={onChat}>{t('titip.receipt_problem')}</Button>}
            </div>
            <p className="text-[12px] leading-relaxed text-ink-muted">{t('titip.receipt_auto', { minutes: autoMinutes })}</p>
          </Card>
        )}

        <Card className="flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <ShoppingBasket size={16} className="text-ink-muted" aria-hidden="true" />
            {t('titip.list_title', { store: titip.store })}
          </p>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {(titip.items || []).map((it, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-ink">{it.name}{it.note ? <span className="text-ink-muted"> · {it.note}</span> : null}</span>
                <span className="shrink-0 font-mono text-ink-muted">{it.qty}</span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-1.5 border-t border-line pt-2">
            <Row label={t('titip.budget_label')}><Money value={Number(titip.budget)} /></Row>
            <Row label={t('titip.if_missing')}>{titip.if_missing === 'skip' ? t('titip.if_missing_skip') : t('titip.if_missing_ask')}</Row>
            {receipt?.status === 'approved' && (
              <>
                <Row label={t('titip.receipt_goods')}><Money value={Number(receipt.amount)} /></Row>
                <Row label={t('titip.fee')}><Money value={fee} /></Row>
                <Row label={t('titip.pay_cash')} strong><Money value={Number(order.total_price)} /></Row>
              </>
            )}
          </dl>
          {receipt?.status === 'approved' && receipt.photos?.length > 0 && <OrderPhotoThumbs paths={receipt.photos} label={t('titip.receipt_photo')} />}
          {!receipt && ['accepted', 'picking_up'].includes(order.status) && <Notice tone="info">{t('titip.shopping_note')}</Notice>}
        </Card>
      </>
    );
  }

  if (!job) return null;
  return (
    <>
      {quote?.status === 'pending' && order.status === 'accepted' && (
        <Card className="flex flex-col gap-3 border-2 border-brand">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <Truck size={18} className="text-brand-ink" aria-hidden="true" />
            {t('big.quote_title')}
          </p>
          <p className="break-words text-[13px] leading-relaxed text-ink">{quote.description}</p>
          <dl><Row label={t('big.quote_price')} strong><Money value={Number(quote.amount)} className="text-[15px]" /></Row></dl>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => respond(quote, false)} isLoading={busy === `${quote.id}:false`} disabled={!!busy}>{t('visit.reject')}</Button>
            <Button onClick={() => respond(quote, true)} isLoading={busy === `${quote.id}:true`} disabled={!!busy}>
              {withMoney(t('visit.quote_approve', { amount: SLOT }), Number(quote.amount))}
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-muted">{t('big.reject_note')}</p>
        </Card>
      )}
      {!quote && ['pending', 'accepted'].includes(order.status) && <Notice tone="info">{t('big.waiting')}</Notice>}
      <Card className="flex flex-col gap-2.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Truck size={16} className="text-ink-muted" aria-hidden="true" />
          {t('big.item_title')}
          {job.helper && <Badge tone="pay">{t('send.big_helper_yes')}</Badge>}
        </p>
        <p className="break-words text-[13px] leading-relaxed text-ink">{job.description}</p>
        <OrderPhotoThumbs paths={job.photos} label={t('visit.photos_label')} />
        {quote?.status === 'approved' && (
          <dl><Row label={t('big.quote_agreed')} strong><Money value={Number(quote.amount)} /></Row></dl>
        )}
      </Card>
    </>
  );
}
