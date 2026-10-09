import { useTranslation } from '../i18n';
import PromoCarousel from '../components/home/PromoCarousel';
import SpotlightCard, { promoService } from '../components/home/SpotlightCard';
import { todayLombok } from '../utils/promoDates';
import { isNative } from '../native/nativeShell';
import { localizeOrderTitle } from '../utils/localizeDbText';
import { SERVICES } from '../config/services';
import { Link } from 'react-router-dom';
import { Wallet, Plus, ArrowUpRight, Settings2, ChevronUp, ChevronDown, Package } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { supabase } from '../config/supabase';
import { useState, useEffect } from 'react';
import { Badge, Button, Card, IconTile, ListRow, Money, SectionHeader, Sheet, cx } from '../components/ui';
import { WALLET_ENABLED } from '../config/wallet';

// Order status -> Badge tone (DESIGN.md §5): searching/pending = warning,
// active = brand, completed = success, cancelled = danger.
const STATUS_TONE = {
  awaiting_payment: 'warning',
  pending: 'warning',
  completed: 'success',
  cancelled: 'danger',
};
const statusTone = (raw) => STATUS_TONE[String(raw || '').toLowerCase()] || 'brand';

// Leading icon for an activity row, from the service catalogue.
const serviceIcon = (serviceName) => SERVICES.find((s) => s.name_id === serviceName)?.icon || Package;

// White / outline actions on the always-dark WiraPay card (Button's
// on-brand variants, applied to router links).
const walletAction = 'inline-flex flex-1 min-h-11 items-center justify-center gap-2 rounded-control px-3 py-2.5 text-center text-sm font-semibold leading-tight transition-colors';

export default function HomePage() {
  const { t, lang } = useTranslation();
  const { balance } = useWallet();
  const { orders } = useOrders();
  const { user } = useAuth();
  const { notifications = [] } = useNotification() || {};
  const [activeServices, setActiveServices] = useState(SERVICES);
  const [globalFlags, setGlobalFlags] = useState([]);
  const [serviceOrder, setServiceOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('serviceOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* invalid stored value: fall back to default */ }
    return SERVICES.map(s => s.id);
  });
  const [hiddenServices, setHiddenServices] = useState(() => {
    try {
      const saved = localStorage.getItem('hiddenServices');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* invalid stored value: fall back to default */ }
    return [];
  });
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [promos, setPromos] = useState([]);

  // Active promos: the spotlight card and the "Promo" tag on service cards.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('promos')
      .select('id, title, code, service_type, usage, usage_limit')
      .eq('status', 'Active')
      .or(`validUntil.is.null,validUntil.gte.${todayLombok()}`)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        setPromos((data || []).filter((p) => p.usage_limit == null || Number(p.usage || 0) < Number(p.usage_limit)));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const updateServices = (flags) => {
      const updatedServices = SERVICES.map(srv => {
        const flag = Array.isArray(flags) ? flags.find(f => f.id === srv.id) : null;
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
    };

    const fetchGlobalFlags = async () => {
      const { data, error } = await supabase.from('feature_flags').select('features').eq('region', 'features_config').maybeSingle();
      if (data && data.features) {
        setGlobalFlags(data.features);
        updateServices(data.features);
      }
    };

    const init = async () => {
      await fetchGlobalFlags();
    };

    init();

    const channel = supabase.channel('feature_flags_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags', filter: "region=eq.features_config" }, (payload) => {
        if (payload.new && payload.new.features) {
          setGlobalFlags(payload.new.features);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const updateServices = () => {
      const updatedServices = SERVICES.map(srv => {
        const flag = Array.isArray(globalFlags) ? globalFlags.find(f => f.id === srv.id) : null;
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
    };
    updateServices();
  }, [globalFlags]);

  const recentOrders = orders.slice(0, 3);

  // Customer's own order (localStorage), unknown ids last. Services an admin
  // switched off are not shown at all, in the grid or in "Arrange".
  const orderIndex = (id) => (serviceOrder.indexOf(id) !== -1 ? serviceOrder.indexOf(id) : 999);
  const orderedServices = activeServices.slice().sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
  const availableServices = orderedServices.filter((s) => s.enabled && (WALLET_ENABLED || s.id !== 'wira_pay'));
  const shownServices = availableServices.filter((s) => !hiddenServices.includes(s.id));
  const promoKeys = new Set(promos.map((p) => promoService(p)?.key).filter(Boolean));
  // The promo the spotlight is showing (when nothing ranks above it), so the
  // carousel below does not repeat it.
  const spotBusy = orders.some((o) => o.rawStatus && !['completed', 'cancelled', 'canceled', 'expired', 'rejected'].includes(String(o.rawStatus).toLowerCase()))
    || notifications.some((n) => !n.is_read && n.created_at && Date.now() - new Date(n.created_at).getTime() < 3 * 24 * 3600 * 1000);
  const spotPromoId = !spotBusy && promos.find((p) => !p.service_type || shownServices.some((sv) => sv.key === promoService(p)?.key))?.id;
  const moveService = (id, neighborId) => {
    const order = orderedServices.map((s) => s.id);
    const i = order.indexOf(id);
    const j = order.indexOf(neighborId);
    if (i === -1 || j === -1) return;
    [order[i], order[j]] = [order[j], order[i]];
    setServiceOrder(order);
    try {
      localStorage.setItem('serviceOrder', JSON.stringify(order));
    } catch (e) {
      console.error('Failed to save service order to local storage', e);
    }
  };
  const hour = new Date().getHours();
  const greetingKey = hour < 11 ? 'home.greeting_morning' : hour < 15 ? 'home.greeting_afternoon' : hour < 18 ? 'home.greeting_evening' : 'home.greeting_night';
  const displayName = user?.user_metadata?.name || user?.name || t('nav.guest_name');
  const serviceLabel = (service) => (lang === 'id'
    ? service.name_id.replace('Wira', '')
    : service.name_en.replace('Wira', ''));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-6">
      {/* Greeting */}
      <div className="flex flex-col gap-0.5">
        <p className="text-[13px] text-ink-muted">{t(greetingKey)}</p>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance break-words">{displayName}</h1>
      </div>

      {/* Kartu Dompet WiraPay (web only, config/wallet) */}
      {WALLET_ENABLED && (
        <section className="overflow-hidden rounded-card bg-laut-700 text-white" aria-label={t('home.wallet_balance')}>
          <div className="h-2.5 tenun-band" aria-hidden="true" />
          <div className="flex flex-col gap-4 px-[18px] pb-[18px] pt-4">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-laut-300">
                  {t('home.wallet_balance')}
                </span>
                <Money value={balance} className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-white" />
              </div>
              <Wallet size={22} className="mt-0.5 shrink-0 text-emas-400" aria-hidden="true" />
            </div>
            <div className="flex gap-2">
              <Link to="/wallet" className={cx(walletAction, 'bg-white text-laut-700 hover:bg-laut-50')}>
                <Plus size={17} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0">{t('home.top_up')}</span>
              </Link>
              <Link to="/wallet" className={cx(walletAction, 'border border-white/30 text-white hover:bg-white/10')}>
                <ArrowUpRight size={17} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0">{t('home.transfer')}</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Most useful thing right now: running order, notice, promo, order again or a tip */}
      <SpotlightCard orders={orders} services={shownServices} promos={promos} />

      {/* Layanan: the focal point. The customer's first two are the big cards. */}
      <section>
        <SectionHeader
          title={t('home.services_title')}
          action={(
            <button
              type="button"
              onClick={() => setIsMenuModalOpen(true)}
              aria-label={t('home.arrange_menu')}
              title={t('home.arrange_menu')}
              className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
            >
              <Settings2 size={16} aria-hidden="true" />
              {t('home.arrange_short')}
            </button>
          )}
        />

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {shownServices.map((service, index) => {
            const Icon = service.icon || Package;
            const hero = index < 2;
            const wide = !hero && index === shownServices.length - 1 && (shownServices.length - 2) % 2 === 1;
            const hasPromo = promoKeys.has(service.key);
            return (
              <Link
                key={service.id}
                to={service.path}
                className={cx(
                  'group relative flex min-w-0 overflow-hidden rounded-[18px] transition-[filter,border-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  hero
                    ? cx('min-h-[150px] flex-col gap-1.5 p-4 hover:brightness-105', index === 0 ? 'bg-laut-700 text-[#F7F6F3]' : 'bg-emas-400 text-[#1E1A10]')
                    : cx('border border-line bg-card hover:border-brand', wide ? 'items-center gap-3 p-3' : 'min-h-[110px] flex-col gap-1.5 p-3'),
                )}
              >
                {hero && <span aria-hidden="true" className={cx('pointer-events-none absolute -bottom-5 -right-5 h-24 w-24 rounded-full border-[10px]', index === 0 ? 'border-white/10' : 'border-black/[0.07]')} />}
                {hasPromo && (
                  <span className={cx('absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold', hero ? (index === 0 ? 'bg-white/20 text-[#F7F6F3]' : 'bg-black/10 text-[#1E1A10]') : 'bg-emas-100 text-emas-700')}>
                    {t('home.promo_tag')}
                  </span>
                )}
                <span
                  className={cx(
                    'grid shrink-0 place-items-center',
                    hero
                      ? cx('h-14 w-14 rounded-2xl', index === 0 ? 'bg-white/15' : 'bg-black/10')
                      : 'h-12 w-12 rounded-[14px] bg-brand-soft text-brand-ink',
                  )}
                >
                  <Icon size={hero ? 32 : 26} aria-hidden="true" />
                </span>
                <span className={cx('flex min-w-0 flex-col', hero && 'mt-auto')}>
                  <span className={cx('break-words font-extrabold tracking-[-0.01em]', hero ? 'text-[19px]' : 'text-[15px] text-ink')}>{serviceLabel(service)}</span>
                  <span className={cx('break-words text-[12px] leading-snug', hero ? (index === 0 ? 'text-[#F7F6F3]/80' : 'text-[#1E1A10]/75') : 'text-ink-muted')}>
                    {t(`home.svc_short_${service.key.replace('wira_', '')}`)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <PromoCarousel services={availableServices} excludeId={spotPromoId} />

      {/* Aktivitas Terkini (Real-time dari Pesanan User) */}
      
      {/* Banner Download */}
      {!isNative() && <section className="mb-4 md:hidden">
        <Link to="/install" className="flex w-full items-center justify-between rounded-xl bg-brand-soft px-4 py-3 text-brand-ink transition-colors hover:bg-brand-soft/80 border border-brand-line">
          <div className="flex flex-col">
            <span className="text-[13.5px] font-bold">{t('download.banner_title')}</span>
            <span className="text-[12px] opacity-90">{t('download.banner_sub')}</span>
          </div>
          <span className="rounded-full bg-brand-ink px-3 py-1 text-[11px] font-bold text-white">{t('download.banner_cta')}</span>
        </Link>
      </section>}

      {recentOrders.length > 0 && (
      <section>
        <SectionHeader
          title={t('home.recent')}
          action={<Link to="/activity" className="hover:underline">{t('common.see_all')}</Link>}
        />

        {recentOrders.length === 0 ? (
          null
        ) : (
          <div className="flex flex-col gap-2">
            {recentOrders.map((ord) => {
              const OrderIcon = serviceIcon(ord.service);
              return (
                <ListRow
                  key={ord.id}
                  as={Link}
                  to="/activity"
                  className="rounded-card border border-line bg-card px-3.5 py-3 hover:border-line-strong"
                  leading={(
                    <IconTile size="sm" tone="brand">
                      <OrderIcon size={17} aria-hidden="true" />
                    </IconTile>
                  )}
                  title={localizeOrderTitle(ord, t)}
                  subtitle={<span className="font-mono">{ord.date}</span>}
                  trailing={(
                    <span className="flex flex-col items-end gap-1">
                      <Money value={ord.price} className="text-[13px] font-medium text-ink" />
                      <Badge tone={statusTone(ord.rawStatus)} dot>{t(ord.statusKey)}</Badge>
                    </span>
                  )}
                />
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Menu Customization Sheet */}
      <Sheet
        open={isMenuModalOpen}
        onClose={() => setIsMenuModalOpen(false)}
        title={t('home.arrange_menu_title')}
        description={t('home.arrange_menu_hint')}
        closeLabel={t('common.close')}
        footer={(
          <Button variant="secondary" onClick={() => setIsMenuModalOpen(false)}>
            {t('common.close')}
          </Button>
        )}
      >
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          {availableServices
          .map((service, index, array) => {
                const isHidden = hiddenServices.includes(service.id);
                
                const moveUp = () => { if (index > 0) moveService(service.id, array[index - 1].id); };
                const moveDown = () => { if (index < array.length - 1) moveService(service.id, array[index + 1].id); };

                const isPay = service.id === 'wira_pay';
                const stepBtn = 'inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

                return (
                  <div key={service.id} className="flex items-center gap-2 px-3 py-1.5">
                    <IconTile size="sm" tone={isPay ? 'pay' : 'brand'}>
                      {service.icon ? <service.icon size={18} aria-hidden="true" /> : <span className="text-sm font-bold">{service.name_id.charAt(4)}</span>}
                    </IconTile>
                    <span className={cx('min-w-0 flex-1 break-words pl-1 text-[14px] font-semibold', isHidden ? 'text-ink-muted' : 'text-ink')}>
                      {serviceLabel(service)}
                    </span>
                    <button type="button" onClick={moveUp} disabled={index === 0} title={t('home.move_up')} aria-label={t('home.move_up')} className={stepBtn}>
                      <ChevronUp size={18} />
                    </button>
                    <button type="button" onClick={moveDown} disabled={index === array.length - 1} title={t('home.move_down')} aria-label={t('home.move_down')} className={stepBtn}>
                      <ChevronDown size={18} />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!isHidden}
                      onClick={() => {
                        const newHidden = isHidden ? hiddenServices.filter(id => id !== service.id) : [...hiddenServices, service.id];
                        setHiddenServices(newHidden);
                        try {
                          localStorage.setItem('hiddenServices', JSON.stringify(newHidden));
                        } catch (e) {
                          console.error("Failed to save hidden services to local storage", e);
                        }
                      }}
                      title={t('home.toggle_service')}
                      aria-label={t('home.toggle_service')}
                      className="inline-flex h-11 w-14 shrink-0 items-center justify-center"
                    >
                      <span className={cx('relative h-7 w-12 rounded-full transition-colors duration-200', !isHidden ? 'bg-brand' : 'bg-line-strong')}>
                        <span className={cx('absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform duration-200', !isHidden ? 'translate-x-5' : 'translate-x-0')} />
                      </span>
                    </button>
                  </div>
                );
              })}
        </Card>
      </Sheet>
    </div>
  );
}
