import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wallet, QrCode, Banknote, RotateCcw, ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  Sheet,
  Field,
  Input,
  Textarea,
  Select,
  Badge,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  cx,
} from '../components/ui';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { fetchCoordinates } from '../utils/osmHelpers';
import { VISIT_SLOTS, openSlots, firstBookableDate, witaToday, witaDatePlus, witaInstant } from '../utils/visitSchedule';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import PromoField from '../components/common/PromoField';
import { WALLET_ENABLED } from '../config/wallet';
import { useAuth } from '../context/AuthContext';
import { uploadPrivateImage } from '../utils/imageUpload';
import { fetchCounterpartyProfiles } from '../services/profileService';
import JobPhotoPicker from '../components/common/JobPhotoPicker';

// ---- Tenun Laut booking helpers (presentational only) ----

// Placeholder used to drop a <Money> into a translated sentence, so an
// amount inside e.g. "Saldo: {{amount}}" still renders in mono.
const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

// "WiraX — Descriptive title" -> eyebrow + title.
function splitTitle(text) {
  const i = text.indexOf(' — ');
  return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [null, text];
}

// Selectable option: 2px brand border + radio when selected.
function ChoiceCard({ selected, onClick, leading, title, subtitle, trailing }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex w-full min-h-11 items-center gap-3 rounded-tile bg-card text-left transition-colors',
        selected ? 'border-2 border-brand px-[13px] py-[11px]' : 'border border-line px-3.5 py-3 hover:border-line-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-brand' : 'border-line-strong')}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {subtitle && <span className="text-[12px] text-ink-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </button>
  );
}

function GroupLabel({ children }) {
  return <p className="text-[13px] font-semibold text-ink">{children}</p>;
}

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export default function PoolPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { orders, addOrder, refreshOrders } = useOrders();
  const { user } = useAuth();

  const [selectedService, setSelectedService] = useState(null);
  const isPackage = selectedService?.id === 'MONTHLY';
  // "Pekerjaan kolam lain" (migrations/0125): priced on site, cash only.
  const isCustom = !!selectedService?.isCustom;
  const [jobDesc, setJobDesc] = useState('');
  const [jobPhotos, setJobPhotos] = useState([]); // File[]
  // "Pesan lagi": the technician of an earlier visit gets the order first.
  const [preferredTech, setPreferredTech] = useState(null); // { id, name }
  const [isModalOpen, setIsModalOpen] = useState(false);

  // How many active pool technicians there are (migrations/0089), and the
  // prices admins set under Manajemen Harga (the server charges these).
  const [poolTechCount, setPoolTechCount] = useState(null);
  const [prices, setPrices] = useState({});
  const [customRule, setCustomRule] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('list_service_technicians', { p_skill: 'Pool' }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('list_service_technicians failed:', error);
      setPoolTechCount(Array.isArray(data) ? data.length : 0);
    });
    supabase.from('pricing_rules').select('*').eq('service_type', 'pool').eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPrices(Object.fromEntries(data.map((r) => [r.code, Number(r.base_price)])));
        setCustomRule(data.find((r) => r.is_custom) || null);
      });
    return () => { cancelled = true; };
  }, []);
  const noPoolTechs = poolTechCount === 0;

  // Monthly package auto-renewal (migrations/0095).
  const [autoRenew, setAutoRenew] = useState(false);
  const [subs, setSubs] = useState([]);
  const loadSubs = () => supabase.from('pool_subscriptions').select('*').order('created_at', { ascending: false })
    .then(({ data }) => setSubs(data || []));
  useEffect(() => { loadSubs(); }, []);
  const toggleSub = async (sub, active) => {
    const { error } = await supabase.rpc('set_pool_subscription_active', { p_id: sub.id, p_active: active });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(active ? t('pool.sub_resumed') : t('pool.sub_stopped'));
    loadSubs();
  };

  // Form State
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [addressNote, setAddressNote] = useState('');
  // Stored on the order for the technician, so the value stays Indonesian;
  // the options below show a translated label.
  const [poolSize, setPoolSize] = useState('Sedang (20-50 m²)');
  const [visitDate, setVisitDate] = useState(() => firstBookableDate());
  const [visitTime, setVisitTime] = useState(() => openSlots(firstBookableDate())[0] || VISIT_SLOTS[0]);
  const timeSlots = openSlots(visitDate);
  const handleDateChange = (date) => {
    setVisitDate(date);
    const slots = openSlots(date);
    if (!slots.includes(visitTime)) setVisitTime(slots[0] || '');
  };
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // `id` matches pricing_rules.code; `name` stays Indonesian because it is
  // saved as the order title the pool technician reads in the partner app.
  // Customer-facing wording lives in `pool.services.*` / `pool.monthly_*`.
  // `price` is only the fallback until pricing_rules loads.
  const services = [
    { id: 'S1', name: 'Pembersihan Rutin', price: 200000 },
    { id: 'S2', name: 'Treatment Air & Klorinasi', price: 150000 },
    { id: 'S3', name: 'Servis Pompa & Filter Kolam', price: 300000 },
  ].map((srv) => ({ ...srv, price: prices[srv.id] ?? srv.price }));

  const monthlyPackage = {
    id: 'MONTHLY',
    name: 'Paket Langganan Kolam Bulanan',
    price: prices.MONTHLY ?? 500000,
  };

  const customService = customRule
    ? { id: customRule.code, name: customRule.name, price: Number(customRule.base_price), isCustom: true }
    : null;

  // Label shown on screen for whichever service is being booked.
  const serviceLabel = (srv) =>
    srv?.id === 'MONTHLY' ? t('pool.monthly_name') : srv?.isCustom ? t('pool.custom_title') : t(`pool.services.${srv?.id}`);

  const handleOpenBooking = (srv, tech = null) => {
    if (noPoolTechs) {
      toast(t('pool.unavailable'));
      return;
    }
    setSelectedService(srv);
    // A package spans four visits; it is not tied to one technician.
    setPreferredTech(srv.id === 'MONTHLY' ? null : tech);
    setJobDesc('');
    setJobPhotos([]);
    if (srv.isCustom) setPaymentMethod('Tunai');
    const date = firstBookableDate();
    setVisitDate(date);
    setVisitTime(openSlots(date)[0] || VISIT_SLOTS[0]);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setIsModalOpen(true);
  };

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError('');
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .eq('code', promoCode.toUpperCase().trim())
        .single();

      if (error || !data) throw new Error(t('promo.not_found'));
      if (data.status !== 'Active') throw new Error(t('promo.inactive'));
      if (isPromoExpired(data.validUntil)) throw new Error(t('promo.expired'));
      if (data.service_type && data.service_type !== 'pool') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  // A code chosen with "Use now" on the home promos (utils/pendingPromo).
  usePendingPromo('pool', promoCode, setPromoCode, handleCheckPromo);

  // The technician of the last finished care visit, for "Pesan lagi".
  const lastVisit = (orders || []).find((o) => o.service_type === 'pool' && o.rawStatus === 'completed'
    && o.driver_id && o.rate_code && o.rate_code !== customRule?.code);
  const [lastTech, setLastTech] = useState(null); // { id, name, svc }
  useEffect(() => {
    if (!lastVisit) { setLastTech(null); return undefined; }
    let cancelled = false;
    fetchCounterpartyProfiles(supabase, [lastVisit.driver_id]).then((map) => {
      if (cancelled) return;
      setLastTech({
        id: lastVisit.driver_id,
        name: map[lastVisit.driver_id]?.name || null,
        svc: lastVisit.rate_code === 'MONTHLY_VISIT' ? 'S1' : lastVisit.rate_code,
        at: lastVisit.created_at,
      });
    });
    return () => { cancelled = true; };
  }, [lastVisit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from "Pesan lagi" on a receipt: /pool?tech=…&svc=…
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const techId = searchParams.get('tech');
    const svc = services.find((x) => x.id === searchParams.get('svc'));
    if (!techId || !svc || poolTechCount === null) return;
    fetchCounterpartyProfiles(supabase, [techId]).then((map) => {
      handleOpenBooking(svc, { id: techId, name: map[techId]?.name || null });
    });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, poolTechCount]);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateFinalPrice = () => {
    const basePrice = selectedService?.price || 0;
    if (!activePromo || isCustom) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!selectedService) return;
    if (!address.trim()) {
      toast.error(t('common.address_required'));
      return;
    }
    if (!visitTime || !openSlots(visitDate).includes(visitTime)) {
      toast.error(t('service.slot_passed'));
      return;
    }

    if (isCustom && jobDesc.trim().length < 10) {
      toast.error(t('service.custom_desc_required'));
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(isPackage ? t('pool.package_insufficient') : t('pool.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      // The pinned point (search, GPS or dragged pin) locates the job for
      // dispatch; a typed address without a pin is geocoded best-effort.
      let point = addressCoords;
      if (!point) {
        try { point = await fetchCoordinates(address); } catch (geoErr) { console.error('Geocode failed:', geoErr); }
      }

      let photoPaths = [];
      if (isCustom && jobPhotos.length > 0) {
        try {
          photoPaths = await Promise.all(jobPhotos.map((f) => uploadPrivateImage(supabase, 'order-photos', user.id, f)));
        } catch (upErr) {
          console.error('Job photo upload failed:', upErr);
          toast.error(t('service.custom_photo_failed'));
          return;
        }
      }

      const details = `Ukuran: ${poolSize} • Lokasi: ${withAddressNote(address, addressNote)} • Kunjungan: ${visitDate} pukul ${visitTime}`
        + (isCustom ? ` • Pekerjaan: ${jobDesc.trim()}` : '');

      // Monthly package (migrations/0090): four weekly visits created and
      // paid with WiraPay in one transaction; each visit is its own order.
      if (isPackage) {
        const { error } = await supabase.rpc('create_pool_package', {
          p_first_visit: witaInstant(visitDate, visitTime),
          p_title: selectedService.name,
          p_details: details,
          p_pickup_lat: point?.lat ?? null,
          p_pickup_lng: point?.lng ?? null,
          p_auto_renew: paymentMethod === 'WiraPay' && autoRenew,
          // 0115: cash = each weekly visit paid to the technician on the day.
          p_payment_method: paymentMethod === 'Tunai' ? 'cash' : 'wallet',
        });
        if (error) throw error;
        loadSubs();
        refreshWallet();
        refreshOrders();
        toast.success(t('pool.package_success'));
        setIsModalOpen(false);
        navigate('/activity');
        return;
      }

      const order = await addOrder({
        pickupLat: point?.lat ?? null,
        pickupLng: point?.lng ?? null,
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraPool - ${selectedService.name}`,
        service: 'WiraPool',
        serviceType: 'pool',
        title: selectedService.name,
        details,
        // migrations/0089: the visit time technicians and dispatch go by.
        metadata: {
          scheduled_at: witaInstant(visitDate, visitTime),
          ...(preferredTech ? { preferred_partner_id: preferredTech.id } : {}),
          ...(isCustom ? { job: { description: jobDesc.trim(), photos: photoPaths } } : {}),
        },
        price: finalPrice,
        paymentMethod: isCustom ? 'Tunai' : paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='pool' ('S1' | 'S2' | 'S3' from `services`, or
        // 'MONTHLY' from `monthlyPackage`), per migrations/0057's seed.
        rateCode: selectedService?.id || null,
        promoCode: isCustom ? null : (activePromo?.code || null),
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      setIsModalOpen(false);

      // OrderContext.addOrder already confirms the order (QRIS: shows the QR).
      handleRemovePromo(); // don't let a used promo silently discount the next order
    } catch (err) {
      toast.error(t('pool.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

  const [titleEyebrow, titleText] = splitTitle(t('pool.title'));

  // Pool-size values are stored on the order as-is (Indonesian); only the
  // labels are translated.
  const poolSizes = [
    { value: 'Kecil (< 20 m²)', label: t('pool.size_small') },
    { value: 'Sedang (20-50 m²)', label: t('pool.size_medium') },
    { value: 'Besar (> 50 m²)', label: t('pool.size_large') },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        eyebrow={titleEyebrow}
        title={titleText}
        subtitle={t('pool.subtitle')}
        className="mb-0"
      />

      {noPoolTechs && <Notice tone="warning">{t('pool.unavailable')}</Notice>}

      {lastTech && !noPoolTechs && (
        <button
          type="button"
          onClick={() => handleOpenBooking(services.find((x) => x.id === lastTech.svc) || services[0], lastTech)}
          className="flex w-full items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-4 py-3 text-left transition-colors hover:brightness-[0.98]"
        >
          <RotateCcw size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-bold text-ink">
              {lastTech.name ? t('pool.again_named', { name: lastTech.name }) : t('pool.again')}
            </span>
            <span className="text-[12px] text-ink-muted">{t('pool.again_hint', { service: t(`pool.services.${lastTech.svc}`) })}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
        </button>
      )}

      {subs.map((sub) => (
        <Card key={sub.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold text-ink">{t('pool.sub_title')}</span>
              <Badge tone={sub.active ? 'success' : 'neutral'} dot>{sub.active ? t('pool.sub_active') : t('pool.sub_paused')}</Badge>
            </span>
            <span className="text-[12.5px] leading-relaxed text-ink-muted">
              {sub.active
                ? t('pool.sub_next', { date: new Date(sub.next_start).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }) })
                : (sub.paused_reason || t('pool.sub_paused'))}
            </span>
          </div>
          <Button variant={sub.active ? 'secondary' : 'primary'} size="sm" onClick={() => toggleSub(sub, !sub.active)}>
            {sub.active ? t('pool.sub_stop') : t('pool.sub_resume')}
          </Button>
        </Card>
      ))}

      {/* Paket Langganan Bulanan */}
      <Card padding="none" className="overflow-hidden">
        <div className="tenun-band h-2.5" aria-hidden="true" />
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col items-start gap-2">
            <Badge tone="brand">{t('pool.popular_badge')}</Badge>
            <h2 className="text-balance text-[19px] font-extrabold leading-snug tracking-tight text-ink">
              {t('pool.monthly_name')}
            </h2>
            <p className="max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
              {t('pool.monthly_desc')}. {t('pool.monthly_tagline')}
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="whitespace-nowrap">
              <Money value={monthlyPackage.price} className="text-[22px] font-medium text-ink" />
              <span className="text-[13px] text-ink-muted">{t('pool.per_month')}</span>
            </p>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => handleOpenBooking(monthlyPackage)}>
              {t('pool.take_package')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Layanan Perawatan Satuan */}
      <section>
        <SectionHeader title={t('pool.single_services')} />
        <div className="flex flex-col gap-3">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-[14px] font-semibold text-ink">{t(`pool.services.${s.id}`)}</h3>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{t(`pool.services.${s.id}_desc`)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Money value={s.price} className="text-[15px] font-medium text-ink" />
                <Button variant="secondary" onClick={() => handleOpenBooking(s)}>
                  {t('pool.order_now')}
                </Button>
              </div>
            </Card>
          ))}
          {customService && (
            <Card className="flex flex-col gap-3 border-pay-line bg-pay-soft">
              <div className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-ink">{t('pool.custom_title')}</h3>
                  <Badge tone="pay">{t('pool.custom_badge')}</Badge>
                </span>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('pool.custom_desc')}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-ink">{withMoney(t('service.custom_price_check', { fee: SLOT }), customService.price, { className: 'font-medium' })}</span>
                <Button variant="secondary" onClick={() => handleOpenBooking(customService)}>
                  {t('pool.order_now')}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* SHEET BOOKING PERAWATAN KOLAM */}
      <Sheet
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        closeLabel={t('common.close')}
        title={t('pool.booking_title', { service: serviceLabel(selectedService) })}
        description={isPackage ? t('pool.package_subtitle') : t('pool.booking_subtitle')}
        footer={
          <Button type="submit" form="pool-booking-form" size="lg" block disabled={loading || !visitTime} isLoading={loading}>
            {loading ? t('common.processing') : t('pool.submit')}
          </Button>
        }
      >
        <form id="pool-booking-form" onSubmit={handleConfirmOrder} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label={isPackage ? t('pool.first_visit') : t('pool.visit_date')} htmlFor="pool-date" required>
              <Input
                id="pool-date"
                type="date"
                value={visitDate}
                min={witaToday()}
                max={witaDatePlus(7)}
                onChange={(e) => handleDateChange(e.target.value)}
                className="font-mono"
                required
              />
            </Field>
            <Field label={t('service.time_label')} htmlFor="pool-time">
              <Select
                id="pool-time"
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
                disabled={timeSlots.length === 0}
              >
                {timeSlots.length === 0 && <option value="">{t('service.no_slots')}</option>}
                {timeSlots.map((time) => (
                  <option key={time} value={time}>{t('service.time_option', { time })}</option>
                ))}
              </Select>
            </Field>
          </div>

          {preferredTech && (
            <Notice tone="info">
              {preferredTech.name ? t('pool.again_notice_named', { name: preferredTech.name }) : t('pool.again_notice')}
            </Notice>
          )}

          {isCustom && (
            <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5">
              <Field label={t('service.custom_desc_label')} htmlFor="pool-job-desc" required hint={t('service.custom_desc_hint')}>
                <Textarea
                  id="pool-job-desc"
                  rows={3}
                  maxLength={500}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder={t('pool.custom_placeholder')}
                  required
                />
              </Field>
              <JobPhotoPicker files={jobPhotos} onChange={setJobPhotos} />
              <Notice tone="warning">{withMoney(t('service.custom_check_note', { fee: SLOT }), selectedService.price)}</Notice>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <GroupLabel>{t('pool.pool_size')}</GroupLabel>
            <div role="radiogroup" aria-label={t('pool.pool_size')} className="flex flex-col gap-2.5">
              {poolSizes.map((size) => (
                <ChoiceCard
                  key={size.value}
                  selected={poolSize === size.value}
                  onClick={() => setPoolSize(size.value)}
                  title={size.label}
                />
              ))}
            </div>
          </div>

          <AddressMapPicker
            id="pool-address"
            label={t('pool.address_label')}
            placeholder={t('pool.address_placeholder')}
            address={address}
            onAddressChange={setAddress}
            coords={addressCoords}
            onCoordsChange={setAddressCoords}
            onNoteChange={setAddressNote}
            markerType="dropoff"
            pinLabel={t('pool.address_label')}
          />
          <AddressNoteField
            id="pool-address-note"
            address={address}
            lat={addressCoords?.lat}
            lng={addressCoords?.lng}
            note={addressNote}
            onNoteChange={setAddressNote}
          />

          {/* Metode Pembayaran */}
          <div className="flex flex-col gap-2">
            <GroupLabel>{t('common.payment_method')}</GroupLabel>
            <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
              {WALLET_ENABLED && !isCustom && (
                <ChoiceCard
                  selected={paymentMethod === 'WiraPay'}
                  onClick={() => setPaymentMethod('WiraPay')}
                  leading={<IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>}
                  title="WiraPay"
                  subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
                />
              )}
              <ChoiceCard
                selected={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                leading={<IconTile tone="success" size="sm"><Banknote size={18} /></IconTile>}
                title={t('common.pay_cash')}
                subtitle={isPackage ? t('pool.package_cash_desc') : t('pool.cash_desc')}
              />
              {!isPackage && !isCustom && <ChoiceCard
                selected={paymentMethod === 'QRIS'}
                onClick={() => setPaymentMethod('QRIS')}
                leading={<IconTile tone="neutral" size="sm"><QrCode size={18} /></IconTile>}
                title={t('common.pay_qris')}
                subtitle={t('common.pay_qris_desc')}
              />}
            </div>
            {paymentMethod === 'WiraPay' && balance < calculateFinalPrice() && (
              <Notice tone="danger">{isPackage ? t('pool.package_insufficient') : t('pool.insufficient_balance')}</Notice>
            )}
            {isPackage && paymentMethod === 'WiraPay' && (
              <label className="flex min-h-11 items-start gap-3 rounded-control border border-line bg-card px-3.5 py-3 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-brand focus:ring-brand/30"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t('pool.auto_renew')}</span>
                  <span className="text-[12px] leading-relaxed text-ink-muted">{t('pool.auto_renew_desc')}</span>
                </span>
              </label>
            )}
          </div>

          {/* Kode Promo (not for the package: four orders, one price) */}
          {isCustom && <p className="text-[12px] text-ink-muted">{t('pool.custom_no_promo')}</p>}
          {!isPackage && !isCustom && <PromoField
            t={t}
            id="pool-promo"
            activePromo={activePromo}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            onApply={handleCheckPromo}
            onRemove={handleRemovePromo}
            checking={checkingPromo}
            error={promoError}
          />}

          <dl className="flex flex-col rounded-card border border-line bg-card p-4 text-[13px]">
            <SummaryRow label={t('pool.total_label')} strong className="text-[14px]">
              <span className="flex flex-col items-end">
                {activePromo && (
                  <Money value={selectedService?.price || 0} tone="muted" className="text-[12px] line-through" />
                )}
                <Money value={calculateFinalPrice()} className="text-[17px] font-medium" />
              </span>
            </SummaryRow>
          </dl>
        </form>
      </Sheet>
    </div>
  );
}
