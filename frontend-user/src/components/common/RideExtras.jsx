import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { CalendarClock, Timer } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, Money, Notice, cx } from '../ui';
import { friendlyError } from '../../utils/friendlyError';

const EXTEND_OPTIONS = [30, 60, 120];

function formatLeft(ms) {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${neg ? '-' : ''}${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Customer side of WiraRide "Nanti" and "Per jam" (migrations/0132): the
 * pickup time, the hourly countdown, and asking the driver for more time.
 */
export default function RideExtras({ order }) {
  const { t, lang } = useTranslation();
  const [adjustments, setAdjustments] = useState([]);
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(Date.now());
  const hourly = order.metadata?.hourly || null;
  const scheduledMs = order.scheduled_at ? new Date(order.scheduled_at).getTime() : null;

  const load = useCallback(async () => {
    if (!hourly) return;
    const { data } = await supabase.from('order_adjustments').select('*').eq('order_id', order.id).eq('kind', 'sewa').order('created_at');
    setAdjustments(data || []);
  }, [order.id, hourly]);

  useEffect(() => {
    load();
    if (!hourly) return undefined;
    const channel = supabase
      .channel(`ride-extend-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, hourly, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (order.service_type !== 'ride' || (!hourly && !scheduledMs)) return null;

  const locale = lang === 'en' ? 'en-GB' : 'id-ID';
  const whenLabel = scheduledMs
    ? new Date(scheduledMs).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const running = ['accepted', 'picking_up', 'in_trip'].includes(order.status);
  const bookedMin = hourly ? Number(hourly.hours || 0) * 60 + Number(hourly.extra_minutes || 0) : 0;
  const startedMs = order.status === 'in_trip' && order.status_changed_at ? new Date(order.status_changed_at).getTime() : null;
  const leftMs = startedMs ? startedMs + bookedMin * 60000 - now : null;
  const pending = adjustments.find((a) => a.status === 'pending');
  const rate = Number(hourly?.rate || 0);

  const extend = async (minutes) => {
    setBusy(minutes);
    try {
      const { error } = await supabase.rpc('request_ride_extension', { p_order_id: order.id, p_minutes: minutes });
      if (error) throw error;
      toast.success(t('rideorder.extend_sent'));
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {scheduledMs && !['completed', 'cancelled', 'expired'].includes(order.status) && (
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <CalendarClock size={17} className="text-brand-ink" aria-hidden="true" />
            {t('rideorder.pickup_at', { time: whenLabel })}
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {order.status === 'pending'
              ? t('rideorder.waiting_driver')
              : order.status === 'accepted' && scheduledMs - now > 60 * 60000
                ? t('rideorder.phone_later')
                : t('rideorder.driver_ready')}
          </p>
          <p className="text-[12px] leading-relaxed text-ink-muted">{t('rideorder.guarantee')}</p>
        </Card>
      )}

      {hourly && (
        <Card className={cx('flex flex-col gap-3', order.status === 'in_trip' && 'border-2 border-brand')}>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
              <Timer size={17} className="text-brand-ink" aria-hidden="true" />
              {t('rideorder.hourly_title', { hours: hourly.hours })}
            </p>
            {Number(hourly.extra_minutes) > 0 && <Badge tone="pay">{t('rideorder.extra', { minutes: hourly.extra_minutes })}</Badge>}
          </div>
          {leftMs != null && (
            <p className="text-[13px] text-ink">
              {leftMs >= 0
                ? t('rideorder.time_left', { left: formatLeft(leftMs) })
                : t('rideorder.overtime', { over: formatLeft(-leftMs) })}
            </p>
          )}
          {hourly.plan && <p className="break-words text-[13px] text-ink-muted">{t('rideorder.plan', { plan: hourly.plan })}</p>}
          {running && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">{t('rideorder.extend_title')}</span>
              {pending ? (
                <Notice tone="info">{t('rideorder.extend_pending', { what: pending.description })}</Notice>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {EXTEND_OPTIONS.map((m) => (
                    <Button key={m} variant="secondary" size="sm" onClick={() => extend(m)} isLoading={busy === m} disabled={!!busy}>
                      {t(m % 60 === 0 ? 'rideorder.plus_hours' : 'rideorder.plus_minutes', { count: m % 60 === 0 ? m / 60 : m })}
                      {' · '}
                      <Money value={Math.ceil((rate * m) / 60 / 500) * 500} />
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-[12px] leading-relaxed text-ink-muted">{t('rideorder.overtime_rule')}</p>
            </div>
          )}
          {adjustments.filter((a) => a.status === 'approved').length > 0 && (
            <dl className="flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
              {adjustments.filter((a) => a.status === 'approved').map((a) => (
                <div key={a.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">{a.description}</dt>
                  <dd><Money value={Number(a.amount)} /></dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}
    </>
  );
}
