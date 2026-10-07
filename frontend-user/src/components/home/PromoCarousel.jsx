import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Copy, Check } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { SERVICES } from '../../config/services';
import { setPendingPromo } from '../../utils/pendingPromo';
import { SectionHeader, cx } from '../ui';

const LOMBOK_TZ = 'Asia/Makassar';
const todayLombok = () => new Date().toLocaleDateString('en-CA', { timeZone: LOMBOK_TZ }); // YYYY-MM-DD

const serviceOf = (promo) => {
  const type = String(promo.service_type || '').toLowerCase().replace(/^wira/, '');
  return type ? SERVICES.find((s) => s.key === `wira_${type}`) || null : null;
};

const discountLabel = (promo) => {
  const n = Number(promo.discount) || 0;
  if (promo.type === 'Percentage') return `${Math.round(n)}%`;
  return n >= 1000 ? `${(n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}rb` : `Rp${Math.round(n)}`;
};

/**
 * Home promos as coupons: discount stub, title, expiry, code with a copy
 * button and "Use now", which opens the service with the code filled in.
 * Hidden entirely when there is nothing to show.
 * `services`: the services currently enabled on the home grid.
 */
export default function PromoCarousel({ services }) {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const [promos, setPromos] = useState([]);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(null);
  const trackRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('promos')
      .select('id, title, description, code, service_type, type, discount, validUntil, usage, usage_limit')
      .eq('status', 'Active')
      .or(`validUntil.is.null,validUntil.gte.${todayLombok()}`)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Promos load failed:', error); return; }
        setPromos(data || []);
      });
    return () => { cancelled = true; };
  }, []);

  const enabledKeys = new Set((services || SERVICES).filter((s) => s.enabled !== false).map((s) => s.key));
  const visible = promos.filter((p) => {
    if (p.usage_limit != null && Number(p.usage || 0) >= Number(p.usage_limit)) return false;
    const svc = serviceOf(p);
    return !p.service_type || (svc && enabledKeys.has(svc.key));
  });

  if (visible.length === 0) return null;

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const step = el.firstElementChild.getBoundingClientRect().width + 12;
    setActive(Math.min(visible.length - 1, Math.round(el.scrollLeft / step)));
  };

  const copy = async (promo) => {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(promo.id);
      setTimeout(() => setCopied((c) => (c === promo.id ? null : c)), 1800);
      toast.success(t('home_promo.copied', { code: promo.code }));
    } catch {
      toast(t('home_promo.copy_manual', { code: promo.code }));
    }
  };

  const use = (promo) => {
    const svc = serviceOf(promo);
    if (!svc) return;
    setPendingPromo(promo.code, svc.key.replace('wira_', ''));
    navigate(svc.path);
  };

  const until = (promo) => (promo.validUntil
    ? t('home_promo.until', { date: new Date(`${promo.validUntil}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short' }) })
    : null);

  return (
    <section aria-label={t('home_promo.title')}>
      <SectionHeader title={t('home_promo.title')} />
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((promo) => {
          const svc = serviceOf(promo);
          const meta = [svc ? svc.name_id : t('home_promo.all_services'), until(promo)].filter(Boolean).join(' · ');
          return (
            <article
              key={promo.id}
              className={cx('flex min-h-[120px] flex-none snap-start overflow-hidden rounded-card border border-line bg-card', visible.length > 1 ? 'w-[90%] sm:w-[360px]' : 'w-full sm:w-[380px]')}
            >
              <div className="flex w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 border-r-2 border-dashed border-ground bg-laut-700 px-1 text-white">
                <span className="font-mono text-[20px] font-medium leading-none tracking-tight">{discountLabel(promo)}</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-laut-300">{t('home_promo.off')}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 pl-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-ink text-balance">{promo.title}</h3>
                  <p className="truncate text-[12px] text-ink-muted">{meta}</p>
                </div>
                <div className="mt-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copy(promo)}
                    aria-label={t('home_promo.copy_aria', { code: promo.code })}
                    className="inline-flex min-h-9 min-w-0 items-center gap-1 rounded-control border border-dashed border-brand-line bg-brand-soft px-2 font-mono text-[12px] font-medium tracking-wide text-brand-ink transition-colors hover:brightness-[0.98]"
                  >
                    <span className="truncate">{promo.code}</span>
                    {copied === promo.id ? <Check size={14} className="shrink-0" aria-hidden="true" /> : <Copy size={14} className="shrink-0" aria-hidden="true" />}
                  </button>
                  {svc && (
                    <button
                      type="button"
                      onClick={() => use(promo)}
                      className="ml-auto inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-control bg-brand px-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
                    >
                      {t('home_promo.use_now')}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {visible.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {visible.map((p, i) => (
            <span key={p.id} className={cx('h-1.5 rounded-full transition-all', i === active ? 'w-4 bg-brand' : 'w-1.5 bg-line-strong')} />
          ))}
        </div>
      )}
    </section>
  );
}
