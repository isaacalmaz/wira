import { useRef, useState } from 'react';
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
const MAX_CARDS = 6;

export const promoService = (promo) => {
  const type = String(promo?.service_type || '').toLowerCase().replace(/^wira/, '');
  return type ? SERVICES.find((s) => s.key === `wira_${type}`) || null : null;
};

// The promo the spotlight shows (the carousel below skips it).
export const spotlightPromo = (promos, services) => {
  const keys = new Set(services.map((s) => s.key));
  return promos.find((p) => !p.service_type || keys.has(promoService(p)?.key)) || null;
};

const btn = 'inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] px-3.5 text-[13px] font-bold transition-[filter] hover:brightness-95';

function Card({ tone, kicker, title, body, action, live }) {
  return (
    <div className={cx('flex h-full flex-col overflow-hidden rounded-[18px] text-[#F7F6F3]', tone === 'gold' ? 'bg-[#2B2410]' : 'bg-laut-700')}>
      <div className="tenun-band h-1.5 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3.5">
        <span className="flex items-center gap-2">
          {live && <span className="h-2 w-2 rounded-full bg-[#5FD39A] shadow-[0_0_0_4px_rgba(95,211,154,0.18)]" aria-hidden="true" />}
          <span className={cx('text-[11px] font-bold uppercase tracking-[0.1em]', tone === 'gold' ? 'text-emas-400' : 'text-laut-300')}>{kicker}</span>
        </span>
        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="break-words text-[17px] font-bold leading-snug">{title}</h2>
            {body && <p className="break-words text-[13px] leading-relaxed text-[#C9D8DB]">{body}</p>}
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}

/**
 * The cards under the greeting on Beranda, swipeable when there is more
 * than one: every running order first, then an unread notice (e.g. an admin
 * announcement, last 3 days), an active promo, and finally "order again"
 * from the last completed order or a suggestion for the time of day.
 * `services`: the services shown on the home grid; `promos`: active promos.
 */
export default function SpotlightCard({ orders, services, promos }) {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { notifications = [], markRead } = useNotification() || {};
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  const now = Date.now();
  const visibleKeys = new Set(services.map((s) => s.key));
  const nameOf = (svc) => (lang === 'en' ? svc.name_en : svc.name_id);
  const cards = [];

  // 1. Every running order
  orders
    .filter((o) => o.rawStatus && !DONE.has(String(o.rawStatus).toLowerCase()))
    .forEach((o) => cards.push({
      key: `order-${o.id}`,
      tone: 'sea',
      live: true,
      kicker: t('home.spot_running', { service: o.service }),
      title: t(o.statusKey),
      body: localizeOrderTitle(o, t),
      action: <Link to={`/active-order/${o.id}`} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_track')}</Link>,
    }));

  // 2. An unread notice from the last few days
  const notice = notifications.find((n) => !n.is_read && n.created_at && now - new Date(n.created_at).getTime() < INFO_MAX_AGE_MS);
  if (notice) {
    const open = () => {
      markRead?.(notice.id);
      navigate(notice.link && notice.link.startsWith('/') ? notice.link : '/notifications');
    };
    cards.push({
      key: `notice-${notice.id}`,
      tone: 'sea',
      kicker: t('home.spot_info'),
      title: notice.title,
      body: notice.description,
      action: <button type="button" onClick={open} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_open')}</button>,
    });
  }

  // 3. An active promo for a service on the grid (or for every service)
  const promo = spotlightPromo(promos, services);
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
    cards.push({
      key: `promo-${promo.id}`,
      tone: 'gold',
      kicker: t('home.spot_promo'),
      title: promo.title,
      body: <span className="inline-flex rounded-lg border border-dashed border-white/35 bg-white/10 px-2 py-0.5 font-mono text-[12.5px] text-[#F7F6F3]">{promo.code}</span>,
      action: <button type="button" onClick={use} className={cx(btn, 'bg-emas-400 text-[#1E1A10]')}>{svc ? t('home.spot_use') : t('home.spot_copy')}</button>,
    });
  }

  // 4. Order again, or else a suggestion for the time of day
  const last = orders.find((o) => String(o.rawStatus).toLowerCase() === 'completed' && o.created_at && now - new Date(o.created_at).getTime() < REORDER_MAX_AGE_MS);
  const lastSvc = last && SERVICES.find((s) => s.name_id === last.service);
  if (last && lastSvc && visibleKeys.has(lastSvc.key)) {
    cards.push({
      key: `again-${last.id}`,
      tone: 'sea',
      kicker: t('home.spot_again'),
      title: localizeOrderTitle(last, t),
      body: t('home.spot_again_body', { service: nameOf(lastSvc) }),
      action: <Link to={lastSvc.path} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_again_cta')}</Link>,
    });
  } else {
    const hour = new Date().getHours();
    const wish = hour < 10 ? 'ride' : hour < 15 ? 'food' : hour < 18 ? 'send' : 'food';
    const pick = services.find((s) => s.key === `wira_${wish}`) || services[0];
    if (pick) {
      cards.push({
        key: 'tip',
        tone: 'sea',
        kicker: t('home.spot_tip'),
        title: t(`home.spot_tip_${pick.key.replace('wira_', '')}`, { service: nameOf(pick) }),
        action: <Link to={pick.path} className={cx(btn, 'bg-[#F7F6F3] text-laut-700')}>{t('home.spot_go')}</Link>,
      });
    }
  }

  const shown = cards.slice(0, MAX_CARDS);
  if (shown.length === 0) return null;
  if (shown.length === 1) return <section aria-label={shown[0].kicker}><Card {...shown[0]} /></section>;

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const step = el.firstElementChild.getBoundingClientRect().width + 10;
    setActive(Math.min(shown.length - 1, Math.round(el.scrollLeft / step)));
  };
  const goTo = (i) => {
    const el = trackRef.current;
    const card = el?.children[i];
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  return (
    <section aria-roledescription="carousel" aria-label={t('home.spot_carousel')} className="flex flex-col gap-2">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 md:mx-0 md:scroll-px-0 md:px-0"
      >
        {shown.map((c, i) => (
          <div
            key={c.key}
            role="group"
            aria-roledescription="slide"
            aria-label={t('home.spot_slide', { n: i + 1, total: shown.length })}
            className="w-[88%] shrink-0 snap-start md:w-[calc(50%-5px)]"
          >
            <Card {...c} />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {shown.map((c, i) => (
          <button
            key={c.key}
            type="button"
            tabIndex={-1}
            onClick={() => goTo(i)}
            className={cx('h-1.5 rounded-full transition-all', i === active ? 'w-5 bg-brand' : 'w-1.5 bg-line-strong')}
          />
        ))}
      </div>
    </section>
  );
}
