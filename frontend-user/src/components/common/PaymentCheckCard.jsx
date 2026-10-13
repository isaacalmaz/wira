import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Button, Card, Field, Input, Money, cx } from '../ui';
import { friendlyError } from '../../utils/friendlyError';

const SLOT = '\u0000';
function withMoney(text, value) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} />{after}</>;
}

const ANSWER_WINDOW_MS = 14 * 24 * 3600 * 1000;

/** True when the customer may still answer "how much did you pay?" for this order. */
function canAskPayment(order) {
  if (!order || order.payment_method !== 'cash' || !order.driver_id) return false;
  if (String(order.rawStatus || order.status).toLowerCase() !== 'completed') return false;
  const at = new Date(order.status_changed_at || order.updated_at || order.created_at).getTime();
  return Number.isFinite(at) && Date.now() - at < ANSWER_WINDOW_MS;
}

/**
 * "How much did you pay?" after a completed cash order (migrations/0125).
 * Only Wira sees the answer; anything but "matches the total" goes to the
 * admins. Hidden once answered.
 */
export default function PaymentCheckCard({ order, partnerName }) {
  const { t } = useTranslation();
  const [state, setState] = useState('loading'); // loading | ask | done | hidden
  const [choice, setChoice] = useState(null); // match | different | unpaid
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const eligible = canAskPayment(order);
  const total = Number(order?.total_price ?? order?.price ?? 0);

  useEffect(() => {
    if (!eligible) { setState('hidden'); return undefined; }
    let cancelled = false;
    supabase.from('payment_checks').select('answer').eq('order_id', order.id).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Before 0125 is applied the table is missing: keep the card hidden.
        if (error) setState('hidden');
        else setState(data ? 'hidden' : 'ask');
      });
    return () => { cancelled = true; };
  }, [eligible, order?.id]);

  if (state !== 'ask' && state !== 'done') return null;
  if (state === 'done') {
    return (
      <Card className="text-[13px] leading-relaxed text-ink-muted">{t('paycheck.thanks')}</Card>
    );
  }

  const send = async (answer) => {
    const value = answer === 'different' ? Number(String(amount).replace(/\D/g, '')) : null;
    if (answer === 'different' && !(value >= 0 && String(amount).trim() !== '')) {
      toast.error(t('paycheck.amount_required'));
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('confirm_order_payment', {
      p_order_id: order.id, p_answer: answer, p_amount: value,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setState('done');
  };

  const options = [
    { key: 'match', label: t('paycheck.match'), trailing: <Money value={total} className="text-[13px]" /> },
    { key: 'different', label: t('paycheck.different'), trailing: <span className="text-[12px] font-normal text-ink-muted">{t('paycheck.different_hint')}</span> },
    { key: 'unpaid', label: t('paycheck.unpaid') },
  ];

  return (
    <Card className="flex flex-col gap-3 border-2 border-pay-line bg-pay-soft">
      <p className="text-[14px] font-bold text-ink">
        {partnerName ? t('paycheck.title_named', { name: partnerName }) : t('paycheck.title')}
      </p>
      <div role="radiogroup" aria-label={t('paycheck.title')} className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={choice === o.key}
            disabled={busy}
            onClick={() => (o.key === 'different' ? setChoice('different') : (setChoice(o.key), send(o.key)))}
            className={cx(
              'flex min-h-11 items-center justify-between gap-3 rounded-control bg-card text-left text-[13.5px] font-semibold text-ink',
              choice === o.key ? 'border-2 border-brand px-[13px] py-[9px]' : 'border border-line-strong px-3.5 py-2.5 hover:border-brand',
            )}
          >
            <span>{o.label}</span>
            {o.trailing}
          </button>
        ))}
      </div>
      {choice === 'different' && (
        <div className="flex flex-col gap-2">
          <Field label={t('paycheck.amount_label')} htmlFor={`paycheck-${order.id}`} hint={withMoney(t('paycheck.amount_hint', { total: SLOT }), total)}>
            <Input
              id={`paycheck-${order.id}`}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              className="font-mono"
            />
          </Field>
          <Button onClick={() => send('different')} isLoading={busy}>{t('paycheck.send')}</Button>
        </div>
      )}
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
        <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('paycheck.private')}
      </p>
    </Card>
  );
}
