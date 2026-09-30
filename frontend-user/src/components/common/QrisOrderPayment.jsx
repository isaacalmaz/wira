import { useEffect, useState } from 'react';
import { Copy, Check, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import QRISCard from './QRISCard';
import { Button, IconTile, Notice } from '../ui';
import { supabase } from '../../config/supabase';
import { formatAmountWithUniqueHighlight } from '../../services/topupService';
import { formatRupiah } from '../../utils/formatRupiah';
import { useTranslation } from '../../i18n';

// Must match expire_awaiting_qris_orders() in migrations/0078.
const PAY_WINDOW_MS = 15 * 60 * 1000;

// Payment screen for an order created with "QRIS" (status 'awaiting_payment',
// migrations/0077). The exact nominal comes from the order's linked
// topup_requests row; the Mutasiku webhook verifies the transfer and the DB
// moves the order on to 'pending', which ActiveOrderPage picks up.
export default function QrisOrderPayment({ order, onCancel, cancelling }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('topup_requests')
      .select('amount')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setAmount(Number(data.amount));
      });
    return () => { cancelled = true; };
  }, [order.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = Math.max(0, new Date(order.created_at).getTime() + PAY_WINDOW_MS - now);
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
  const formatted = amount ? formatAmountWithUniqueHighlight(amount) : null;
  const uniqueCode = amount ? amount - Number(order.total_price || 0) : 0;

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(String(amount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('order.qris_copy_failed'));
    }
  };

  return (
    <div className="mb-2 flex shrink-0 flex-col gap-4 border-b border-line bg-card px-4 py-5">
      <div className="flex items-center gap-3">
        <IconTile tone="pay" size="sm"><QrCode size={18} /></IconTile>
        <p className="min-w-0 flex-1 text-[15px] font-bold tracking-tight text-ink text-balance">{t('order.qris_pay_title')}</p>
      </div>

      <QRISCard />

      <div className="flex items-center gap-3 rounded-card border border-line bg-ground px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{t('wallet.bill_total')}</span>
          {formatted ? (
            <span className="whitespace-nowrap font-mono text-2xl font-medium tracking-tight text-ink">
              {formatted.prefix}
              <span className="text-pay-ink underline decoration-pay-line decoration-2 underline-offset-4">{formatted.uniqueDigits}</span>
            </span>
          ) : (
            <span className="text-sm text-ink-muted">{t('order.qris_loading_amount')}</span>
          )}
        </div>
        {formatted && (
          <Button
            variant="secondary"
            onClick={copyAmount}
            title={t('common.copy')}
            aria-label={t('common.copy')}
            leftIcon={copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          >
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        )}
      </div>

      <p className="text-[13px] leading-relaxed text-ink">
        {t('order.qris_exact_note')}
        {uniqueCode > 0 && ` ${t('order.qris_overpay_note', { amount: formatRupiah(uniqueCode) })}`}
      </p>

      <Notice tone={remainingMs > 0 ? 'warning' : 'danger'}>
        {remainingMs > 0 ? t('order.qris_countdown', { time: `${mm}:${ss}` }) : t('order.qris_expired')}
      </Notice>

      <p className="text-xs leading-relaxed text-ink-muted">
        {t('order.qris_footer')}
      </p>

      <Button
        variant="danger-soft"
        block
        onClick={onCancel}
        isLoading={cancelling}
      >
        {cancelling ? t('common.cancelling') : t('order.cancel_order')}
      </Button>
    </div>
  );
}
