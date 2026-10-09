import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../../i18n';
import { useNotification } from '../../context/NotificationContext';
import { localizeOrderTitle } from '../../utils/localizeDbText';
import { setPendingPromo } from '../../utils/pendingPromo';
import { SERVICES } from '../../config/services';
import { cx } from '../ui';

// Statuses where an order is over and no longer "running".
const DONE = new Set(['completed', 'cancelled', 'canceled', 'expired', 'rejected']);
const INFO_MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const REORDER_MAX_AGE_MS = 60 * 24 * 3600 * 1000;

export const promoService = (promo) => {
  const type = String(promo?.service_type || '').toLowerCase().replace(/^wira/, '');
  return type ? SERVICES.find((s) => s.key === `wira_${type}`) || null : null;
};

const btn = 'inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] px-3.5 text-[13px] font-bold transition-[filter] hover:brightness-95';

/**
 * The card under the greeting on Beranda. Shows the most useful thing right
 * now, in this order: a running order, an unread notice (e.g. an admin
 * announcement, last 3 days), an active promo, "order again" from the last
 * completed order, or a suggestion for the time of day.
 * `services`: the services shown on the home grid; `promos`: active promos.
 */
export default function SpotlightCard({ orders, services, promos }) {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { notifications = [], markRead } = useNotification() || {};
  const now = Date.now();
  const serviceByName = (name) => SERVICES.find((s) => s.name_id === name);
  const visibleKeys = new Set(services.map((s) => s.key));

  const shell = (tone, kicker, title, body, action, live = false) => (
    <section
      aria-label={kicker}
      className={cx('overflow-hidden rounded-[18px] text-[#F7F6F3]', tone === 'gold' ? 'bg-[#2B2410]' : 'bg-laut-700')}
    >
      <div className="tenun-band h-1.5" aria-hidden="true" />
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <span className="flex items-center gap-2">
          {live && <span className="h-2 w-2 rounded-full bg-[#5FD39A] shadow-[0_0_0_4px_rgba(95,211,154,0.18)]" aria-hidden="true" />}
          <span className={cx('text-[11px] font-bold uppercase tracking-[0.1em]', tone === 'gold' ? 'text-emas-400' : 'text-laut-300')}>{kicker}</span>
        </span>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="break-words text-[17px] font-bold leading-snug">{title}</h2>
            {body && <p className="break-words text-[13px] leading-relaxed text-[#C9D8DB]">{body}</p>}
          </div>
          {action}
        </div>
      </div>
    </section>
  );

  // 1. A running order
  const running = orders.filter((o) => o.rawStatus && !DONE.has(String(o.rawStatus).toLowerCase()));
  if (running.length > 0) {
    const o = running[0];
    const more = running.length - 1;
    return shell(
      'sea',
      t('home.spot_running', { service: o.service }),
      t(o.statusKey),
      [localizeOrderTitle(o, t), more > 0 ? t('home.spot_running_more', { count: more }) : null].filter(Boolean).join(' · '),
      <Link to={`/active-order/${o.id}`} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_track')}</Link>,
      true,
    );
  }

  // 2. An unread notice from the last few days
  const notice = notifications.find((n) => !n.is_read && n.created_at && now - new Date(n.created_at).getTime() < INFO_MAX_AGE_MS);
  if (notice) {
    const open = () => {
      markRead?.(notice.id);
      navigate(notice.link && notice.link.startsWith('/') ? notice.link : '/notifications');
    };
    return shell(
      'sea',
      t('home.spot_info'),
      notice.title,
      notice.description,
      <button type="button" onClick={open} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_open')}</button>,
    );
  }

  // 3. An active promo for a service on the grid (or for every service)
  const promo = promos.find((p) => {
    const svc = promoService(p);
    return !p.service_type || (svc && visibleKeys.has(svc.key));
  });
  if (promo) {
    const svc = promoService(promo);
    const use = async () => {
      if (svc) {
        setPendingPromo(promo.code, svc.key.replace('wira_', ''));
        navigate(svc.path);
        return;
      }
      try {
        await navigator.clipboard.writeText(promo.code);
        toast.success(t('home_promo.copied', { code: promo.code }));
      } catch {
        toast(t('home_promo.copy_manual', { code: promo.code }));
      }
    };
    return shell(
      'gold',
      t('home.spot_promo'),
      promo.title,
      <span className="inline-flex rounded-lg border border-dashed border-white/35 bg-white/10 px-2 py-0.5 font-mono text-[12.5px] text-[#F7F6F3]">{promo.code}</span>,
      <button type="button" onClick={use} className={cx(btn, 'bg-emas-400 text-[#1E1A10]')}>{svc ? t('home.spot_use') : t('home.spot_copy')}</button>,
    );
  }

  // 4. Order again
  const last = orders.find((o) => String(o.rawStatus).toLowerCase() === 'completed' && o.created_at && now - new Date(o.created_at).getTime() < REORDER_MAX_AGE_MS);
  const lastSvc = last && serviceByName(last.service);
  if (last && lastSvc && visibleKeys.has(lastSvc.key)) {
    return shell(
      'sea',
      t('home.spot_again'),
      localizeOrderTitle(last, t),
      t('home.spot_again_body', { service: lang === 'en' ? lastSvc.name_en : lastSvc.name_id }),
      <Link to={lastSvc.path} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_again_cta')}</Link>,
    );
  }

  // 5. A suggestion for the time of day
  const hour = new Date().getHours();
  const wish = hour < 10 ? 'ride' : hour < 15 ? 'food' : hour < 18 ? 'send' : 'food';
  const pick = services.find((s) => s.key === `wira_${wish}`) || services[0];
  if (!pick) return null;
  const pickKey = pick.key.replace('wira_', '');
  return shell(
    'sea',
    t('home.spot_tip'),
    t(`home.spot_tip_${pickKey}`, { service: lang === 'en' ? pick.name_en : pick.name_id }),
    null,
    <Link to={pick.path} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_go')}</Link>,
  );
}
