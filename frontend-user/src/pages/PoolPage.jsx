import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wallet,
  QrCode,
  Banknote,
  RotateCcw,
  ChevronRight,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  BadgeCheck,
  Droplets,
  Wrench,
  Calendar,
  Clock,
} from 'lucide-react';
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Badge,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  Segmented,
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
import {
  VISIT_SLOTS,
  openSlots,
  firstBookableDate,
  witaToday,
  witaDatePlus,
  witaInstant,
} from '../utils/visitSchedule';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import PromoField from '../components/common/PromoField';
import { WALLET_ENABLED } from '../config/wallet';
import { useAuth } from '../context/AuthContext';
import { uploadPrivateImage } from '../utils/imageUpload';
import { fetchCounterpartyProfiles } from '../services/profileService';
import JobPhotoPicker from '../components/common/JobPhotoPicker';

const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

function splitTitle(text) {
  const i = text.indexOf(' — ');
  return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [null, text];
}

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
        className={cx(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-brand' : 'border-line-strong',
        )}
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

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

const formatFriendlyDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    return dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export default function PoolPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { orders, addOrder, refreshOrders } = useOrders();
  const { user } = useAuth();

  // ALUR PROGRESIF 2 JENDELA: Step 1 (Pilih Layanan & Ukuran) -> Step 2 (Jadwal, Alamat & Pembayaran)
  const [step, setStep] = useState(1);
  const [tabCategory, setTabCategory] = useState('all'); // 'all' | 'monthly' | 'single' | 'custom'

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
    supabase
      .from('pricing_rules')
      .select('*')
      .eq('service_type', 'pool')
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPrices(Object.fromEntries(data.map((r) => [r.code, Number(r.base_price)])));
        setCustomRule(data.find((r) => r.is_custom) || null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const noPoolTechs = poolTechCount === 0;

  // Layanan Terdefinisi
  const services = useMemo(() => [
    {
      id: 'S1',
      name: 'Pembersihan Rutin',
      desc: t('pool.services.S1_desc'),
      price: prices.S1 ?? 200000,
      icon: Droplets,
    },
    {
      id: 'S2',
      name: 'Perawatan Air & Klorinasi',
      desc: t('pool.services.S2_desc'),
      price: prices.S2 ?? 150000,
      icon: Sparkles,
    },
    {
      id: 'S3',
      name: 'Servis Pompa & Filter',
      desc: t('pool.services.S3_desc'),
      price: prices.S3 ?? 300000,
      icon: Wrench,
    },
  ], [prices, t]);

  const monthlyPackage = useMemo(() => ({
    id: 'MONTHLY',
    name: 'Paket Langganan Kolam Bulanan',
    desc: t('pool.monthly_desc'),
    price: prices.MONTHLY ?? 500000,
  }), [prices, t]);

  const customService = useMemo(() => (
    customRule
      ? { id: customRule.code, name: customRule.name, price: Number(customRule.base_price), isCustom: true }
      : null
  ), [customRule]);

  // Layanan yang dipilih (Default: Paket Bulanan)
  const [selectedService, setSelectedService] = useState(monthlyPackage);
  useEffect(() => {
    setSelectedService((prev) => (!prev || prev.id === 'MONTHLY' ? monthlyPackage : prev));
  }, [monthlyPackage]);

  const isPackage = selectedService?.id === 'MONTHLY';
  const isCustom = !!selectedService?.isCustom;

  // Ukuran Kolam (disimpan untuk teknisi kolam)
  const poolSizes = [
    { value: 'Kecil (< 20 m²)', label: t('pool.size_small'), dim: '< 20 m²' },
    { value: 'Sedang (20-50 m²)', label: t('pool.size_medium'), dim: '20–50 m²' },
    { value: 'Besar (> 50 m²)', label: t('pool.size_large'), dim: '> 50 m²' },
  ];
  const [poolSize, setPoolSize] = useState('Sedang (20-50 m²)');

  // Form State Kustom
  const [jobDesc, setJobDesc] = useState('');
  const [jobPhotos, setJobPhotos] = useState([]);
  const [preferredTech, setPreferredTech] = useState(null);

  // Jadwal Kunjungan
  const [visitDate, setVisitDate] = useState(() => firstBookableDate());
  const [visitTime, setVisitTime] = useState(() => openSlots(firstBookableDate())[0] || VISIT_SLOTS[0]);
  const timeSlots = openSlots(visitDate);

  const handleDateChange = (date) => {
    setVisitDate(date);
    const slots = openSlots(date);
    if (!slots.includes(visitTime)) setVisitTime(slots[0] || '');
  };

  // Alamat & Lokasi (Otomatis diambil dari saved_addresses jika login)
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [addressNote, setAddressNote] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('saved_addresses')
      .select('address, lat, lng, note')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (data.address) {
          setAddress((prev) => (prev ? prev : data.address));
          if (data.lat != null && data.lng != null) {
            setAddressCoords((prev) => (prev ? prev : { lat: Number(data.lat), lng: Number(data.lng) }));
          }
          if (data.note) {
            setAddressNote((prev) => (prev ? prev : data.note));
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Pembayaran & Promo
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [autoRenew, setAutoRenew] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);

  // Langganan Aktif
  const [subs, setSubs] = useState([]);
  const loadSubs = () =>
    supabase
      .from('pool_subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setSubs(data || []));
  useEffect(() => {
    loadSubs();
  }, []);

  const toggleSub = async (sub, active) => {
    const { error } = await supabase.rpc('set_pool_subscription_active', { p_id: sub.id, p_active: active });
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(active ? t('pool.sub_resumed') : t('pool.sub_stopped'));
    loadSubs();
  };

  // Teknisi Kunjungan Terakhir untuk "Pesan Lagi"
  const lastVisit = (orders || []).find(
    (o) =>
      o.service_type === 'pool' &&
      o.rawStatus === 'completed' &&
      o.driver_id &&
      o.rate_code &&
      o.rate_code !== customRule?.code,
  );
  const [lastTech, setLastTech] = useState(null);
  useEffect(() => {
    if (!lastVisit) {
      setLastTech(null);
      return undefined;
    }
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
    return () => {
      cancelled = true;
    };
  }, [lastVisit]);

  // Handle URL query parameters /pool?tech=…&svc=…
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const techId = searchParams.get('tech');
    const svc = services.find((x) => x.id === searchParams.get('svc'));
    if (!techId || !svc || poolTechCount === null) return;
    fetchCounterpartyProfiles(supabase, [techId]).then((map) => {
      setSelectedService(svc);
      setPreferredTech({ id: techId, name: map[techId]?.name || null });
      setStep(2);
    });
    setSearchParams({}, { replace: true });
  }, [searchParams, poolTechCount, services, setSearchParams]);

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
  usePendingPromo('pool', promoCode, setPromoCode, handleCheckPromo);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateFinalPrice = () => {
    const basePrice = selectedService?.price || 0;
    if (!activePromo || isCustom) return basePrice;
    if (activePromo.type === 'Percentage') {
      const disc = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - disc);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleSelectServiceAndProceed = (srv) => {
    if (noPoolTechs) {
      toast(t('pool.unavailable'));
      return;
    }
    setSelectedService(srv);
    if (srv.id === 'MONTHLY') setPreferredTech(null);
    if (srv.isCustom) setPaymentMethod('Tunai');
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error(t('common.login_required'));
      navigate('/login');
      return;
    }
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
      let point = addressCoords;
      if (!point) {
        try {
          point = await fetchCoordinates(address);
        } catch (geoErr) {
          console.error('Geocode failed:', geoErr);
        }
      }

      let photoPaths = [];
      if (isCustom && jobPhotos.length > 0) {
        try {
          photoPaths = await Promise.all(
            jobPhotos.map((f) => uploadPrivateImage(supabase, 'order-photos', user.id, f)),
          );
        } catch (upErr) {
          console.error('Job photo upload failed:', upErr);
          toast.error(t('service.custom_photo_failed'));
          return;
        }
      }

      const details =
        `Ukuran: ${poolSize} • Lokasi: ${withAddressNote(address, addressNote)} • Kunjungan: ${visitDate} pukul ${visitTime}` +
        (isCustom ? ` • Pekerjaan: ${jobDesc.trim()}` : '');

      if (isPackage) {
        const { error } = await supabase.rpc('create_pool_package', {
          p_first_visit: witaInstant(visitDate, visitTime),
          p_title: selectedService.name,
          p_details: details,
          p_pickup_lat: point?.lat ?? null,
          p_pickup_lng: point?.lng ?? null,
          p_auto_renew: paymentMethod === 'WiraPay' && autoRenew,
          p_payment_method: paymentMethod === 'Tunai' ? 'cash' : 'wallet',
        });
        if (error) throw error;
        loadSubs();
        refreshWallet();
        refreshOrders();
        toast.success(t('pool.package_success'));
        navigate('/activity');
        return;
      }

      const order = await addOrder({
        pickupLat: point?.lat ?? null,
        pickupLng: point?.lng ?? null,
        paymentDescription: `WiraPool - ${selectedService.name}`,
        service: 'WiraPool',
        serviceType: 'pool',
        title: selectedService.name,
        details,
        metadata: {
          scheduled_at: witaInstant(visitDate, visitTime),
          ...(preferredTech ? { preferred_partner_id: preferredTech.id } : {}),
          ...(isCustom ? { job: { description: jobDesc.trim(), photos: photoPaths } } : {}),
        },
        price: finalPrice,
        paymentMethod: isCustom ? 'Tunai' : paymentMethod,
        rateCode: selectedService?.id || null,
        promoCode: isCustom ? null : (activePromo?.code || null),
      });

      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      handleRemovePromo();
    } catch (err) {
      toast.error(t('pool.failed', { message: err.userMessage || friendlyError(err) }), {
        id: 'order-create-error',
      });
    } finally {
      setLoading(false);
    }
  };

  const [titleEyebrow, titleText] = splitTitle(t('pool.title'));

  const serviceLabel = (srv) =>
    srv?.id === 'MONTHLY'
      ? t('pool.monthly_name')
      : srv?.isCustom
      ? t('pool.custom_title')
      : t(`pool.services.${srv?.id}`) || srv?.name;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-32">
      {/* HEADER NAVIGASI */}
      {step === 1 ? (
        <PageHeader
          back="/"
          backLabel={t('common.back')}
          eyebrow={titleEyebrow}
          title={titleText}
          subtitle={t('pool.subtitle')}
          className="mb-0"
        />
      ) : (
        <PageHeader
          back="#"
          onBack={() => setStep(1)}
          backLabel={t('pool.change_service')}
          title={t('pool.step_2_title')}
          subtitle={serviceLabel(selectedService)}
          className="mb-0"
        />
      )}

      {noPoolTechs && <Notice tone="warning">{t('pool.unavailable')}</Notice>}

      {/* ============================================================== */}
      {/* JENDELA 1: PILIH PAKET / LAYANAN & UKURAN KOLAM               */}
      {/* ============================================================== */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          {/* Pilihan Pesan Lagi Teknisi Terakhir */}
          {lastTech && !noPoolTechs && (
            <button
              type="button"
              onClick={() => {
                const svc = services.find((x) => x.id === lastTech.svc) || services[0];
                setSelectedService(svc);
                setPreferredTech(lastTech);
                setStep(2);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex w-full items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-4 py-3 text-left transition-colors hover:brightness-[0.98]"
            >
              <RotateCcw size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-bold text-ink">
                  {lastTech.name ? t('pool.again_named', { name: lastTech.name }) : t('pool.again')}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {t('pool.again_hint', { service: t(`pool.services.${lastTech.svc}`) || 'Perawatan Kolam' })}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
            </button>
          )}

          {/* Langganan Aktif */}
          {subs.map((sub) => (
            <Card key={sub.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-ink">{t('pool.sub_title')}</span>
                  <Badge tone={sub.active ? 'success' : 'neutral'} dot>
                    {sub.active ? t('pool.sub_active') : t('pool.sub_paused')}
                  </Badge>
                </span>
                <span className="text-[12.5px] leading-relaxed text-ink-muted">
                  {sub.active
                    ? t('pool.sub_next', {
                        date: new Date(sub.next_start).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        }),
                      })
                    : sub.paused_reason || t('pool.sub_paused')}
                </span>
              </div>
              <Button
                variant={sub.active ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => toggleSub(sub, !sub.active)}
              >
                {sub.active ? t('pool.sub_stop') : t('pool.sub_resume')}
              </Button>
            </Card>
          ))}

          {/* Tab Filter Kategori */}
          <Segmented
            value={tabCategory}
            onChange={setTabCategory}
            options={[
              { value: 'all', label: t('pool.tab_all') },
              { value: 'monthly', label: t('pool.tab_monthly') },
              { value: 'single', label: t('pool.tab_single') },
              { value: 'custom', label: t('pool.tab_custom') },
            ]}
            className="w-full"
          />

          {/* 1. Paket Langganan Bulanan (Paling Populer) */}
          {(tabCategory === 'all' || tabCategory === 'monthly') && (
            <Card
              padding="none"
              className={cx(
                'overflow-hidden transition-all',
                selectedService?.id === 'MONTHLY'
                  ? 'border-2 border-brand bg-brand-soft/20'
                  : 'border border-line hover:border-line-strong',
              )}
            >
              <div className="tenun-band h-2" aria-hidden="true" />
              <div className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{t('pool.popular_badge')}</Badge>
                    {selectedService?.id === 'MONTHLY' && (
                      <Badge tone="success" dot>{t('common.selected') || 'Dipilih'}</Badge>
                    )}
                  </div>
                  <h2 className="text-[18px] font-extrabold leading-snug tracking-tight text-ink">
                    {t('pool.monthly_name')}
                  </h2>
                  <p className="text-[13px] leading-relaxed text-ink-muted">
                    {t('pool.package_includes')}
                  </p>
                </div>

                <div className="flex flex-col gap-3 border-t border-line pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Money value={monthlyPackage.price} className="text-[20px] font-medium text-ink" />
                    <span className="text-[12.5px] text-ink-muted">{t('pool.per_month')}</span>
                  </div>
                  <Button
                    variant={selectedService?.id === 'MONTHLY' ? 'primary' : 'secondary'}
                    size="md"
                    onClick={() => handleSelectServiceAndProceed(monthlyPackage)}
                    disabled={noPoolTechs}
                    rightIcon={<ArrowRight size={15} />}
                  >
                    {selectedService?.id === 'MONTHLY' ? t('pool.proceed_to_schedule') : t('pool.take_package')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* 2. Layanan Perawatan Satuan */}
          {(tabCategory === 'all' || tabCategory === 'single') && (
            <section className="flex flex-col gap-3">
              <SectionHeader title={t('pool.single_services')} className="mb-0" />
              <div className="grid gap-3">
                {services.map((s) => {
                  const isSelected = selectedService?.id === s.id;
                  const Icon = s.icon;
                  return (
                    <Card
                      key={s.id}
                      padding="none"
                      onClick={() => { if (!noPoolTechs) handleSelectServiceAndProceed(s); }}
                      className={cx(
                        'flex flex-col justify-between gap-3 p-4 transition-all cursor-pointer select-none',
                        isSelected
                          ? 'border-2 border-brand bg-brand-soft/20'
                          : 'border border-line bg-card hover:border-line-strong',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <IconTile tone={isSelected ? 'brand' : 'neutral'} size="md">
                          <Icon size={18} />
                        </IconTile>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[14px] font-bold text-ink">{t(`pool.services.${s.id}`) || s.name}</h3>
                            {isSelected && <Badge tone="brand" dot>{t('common.selected') || 'Dipilih'}</Badge>}
                          </div>
                          <p className="text-[12.5px] leading-relaxed text-ink-muted">{s.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-line/60 pt-3">
                        <Money value={s.price} className="text-[15px] font-medium text-ink" />
                        <Button
                          variant={isSelected ? 'primary' : 'secondary'}
                          size="sm"
                          disabled={noPoolTechs}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectServiceAndProceed(s);
                          }}
                          rightIcon={<ArrowRight size={14} />}
                        >
                          {isSelected ? t('pool.proceed_to_schedule') : t('pool.order_now')}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Pekerjaan Kustom / Khusus */}
          {(tabCategory === 'all' || tabCategory === 'custom') && customService && (
            <section className="flex flex-col gap-3">
              <SectionHeader title={t('pool.tab_custom')} className="mb-0" />
              <Card
                padding="none"
                onClick={() => { if (!noPoolTechs) handleSelectServiceAndProceed(customService); }}
                className={cx(
                  'flex flex-col justify-between gap-3 p-4 transition-all cursor-pointer select-none',
                  selectedService?.isCustom
                    ? 'border-2 border-brand bg-brand-soft/20'
                    : 'border border-line bg-card hover:border-line-strong',
                )}
              >
                <div className="flex items-start gap-3">
                  <IconTile tone={selectedService?.isCustom ? 'brand' : 'neutral'} size="md">
                    <Sparkles size={18} />
                  </IconTile>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-ink">{t('pool.custom_title')}</h3>
                        <Badge tone="brand">{t('pool.custom_badge')}</Badge>
                      </div>
                      {selectedService?.isCustom && <Badge tone="brand" dot>{t('common.selected') || 'Dipilih'}</Badge>}
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('pool.custom_desc')}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-line/60 pt-3">
                  <span className="text-[13px] text-ink font-semibold">
                    {withMoney(t('service.custom_price_check', { fee: SLOT }), customService.price, {
                      className: 'font-medium',
                    })}
                  </span>
                  <Button
                    variant={selectedService?.isCustom ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={noPoolTechs}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectServiceAndProceed(customService);
                    }}
                    rightIcon={<ArrowRight size={14} />}
                  >
                    {selectedService?.isCustom ? t('pool.proceed_to_schedule') : t('pool.order_now')}
                  </Button>
                </div>
              </Card>
            </section>
          )}

          {/* Pilihan Ukuran Kolam Langsung di Langkah 1 */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-bold text-ink">{t('pool.pool_size')}</span>
              <span className="text-[12px] text-ink-muted">
                Pilih perkiraan ukuran kolam untuk persiapan obat & alat teknisi
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {poolSizes.map((size) => {
                const isSelected = poolSize === size.value;
                return (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() => setPoolSize(size.value)}
                    className={cx(
                      'flex min-h-12 items-center justify-between rounded-tile p-3 text-left transition-all',
                      isSelected
                        ? 'border-2 border-brand bg-brand-soft/40'
                        : 'border border-line bg-card hover:border-line-strong',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13.5px] font-bold text-ink">{size.label}</span>
                      <span className="font-mono text-[11px] text-ink-muted">{size.dim}</span>
                    </div>
                    <span
                      className={cx(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected ? 'border-brand' : 'border-line-strong',
                      )}
                    >
                      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Jaminan Layanan */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[12px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ShieldCheck size={15} className="text-success" /> Teknisi Terverifikasi & Berpengalaman
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <BadgeCheck size={15} className="text-brand-ink" /> Garansi Kualitas Air Bening
            </span>
          </div>

          {/* STICKY BOTTOM BAR (LANGKAH 1) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-[var(--sidebar-w,16rem)] md:px-8 transition-[left] duration-200 pointer-events-none">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-card bg-brand px-4 py-3 text-white shadow-pop pointer-events-auto">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[12px] text-white/80">
                  {serviceLabel(selectedService)} • {poolSize.split(' ')[0]}
                </p>
                <Money value={selectedService?.price || 0} className="text-[18px] font-bold text-white tracking-tight" />
              </div>
              <Button
                variant="on-brand"
                size="md"
                disabled={noPoolTechs}
                rightIcon={<ArrowRight size={16} />}
                onClick={() => {
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="shrink-0 px-5 font-bold shadow-sm"
              >
                {t('pool.proceed_to_schedule')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* JENDELA 2: JADWAL, ALAMAT & PEMBAYARAN                         */}
      {/* ============================================================== */}
      {step === 2 && (
        <form onSubmit={handleConfirmOrder} className="flex flex-col gap-4">
          {/* 1. Ringkasan Layanan yang Dipilih */}
          <Card className="flex items-center justify-between border-brand-line bg-brand-soft/30 p-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-ink">
                {t('pool.selected_service_summary')}
              </span>
              <h3 className="truncate text-[14px] font-bold text-ink">
                {serviceLabel(selectedService)}
              </h3>
              <p className="text-[12px] text-ink-muted">
                {t('pool.selected_pool_size', { size: poolSize })}
              </p>
              <Money value={selectedService?.price || 0} className="font-mono text-[14px] font-bold text-brand-ink mt-0.5" />
            </div>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="shrink-0 rounded-control border border-brand/30 bg-card px-3 py-1.5 text-xs font-bold text-brand-ink hover:bg-sunken transition-colors"
            >
              {t('pool.change_service')}
            </button>
          </Card>

          {/* Form Kustom Tambahan jika memilih Pekerjaan Kustom */}
          {isCustom && (
            <Card className="flex flex-col gap-3">
              <SectionHeader title={t('service.custom_desc_label')} className="mb-0" />
              <Field htmlFor="pool-job-desc" required hint={t('service.custom_desc_hint')}>
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
              <Notice tone="warning">
                {withMoney(t('service.custom_check_note', { fee: SLOT }), selectedService.price)}
              </Notice>
            </Card>
          )}

          {/* Notifikasi Teknisi Pilihan jika Pesan Lagi */}
          {preferredTech && (
            <Notice tone="info">
              {preferredTech.name ? t('pool.again_notice_named', { name: preferredTech.name }) : t('pool.again_notice')}
            </Notice>
          )}

          {/* 2. Jadwal Kunjungan & Waktu */}
          <Card className="flex flex-col gap-4">
            <SectionHeader title={isPackage ? t('pool.first_visit') : t('pool.visit_date')} className="mb-0" />

            <div className="flex flex-col gap-1.5">
              <Field label={isPackage ? t('pool.first_visit') : t('pool.visit_date')} htmlFor="pool-date" required>
                <div className="relative">
                  <Input
                    id="pool-date"
                    type="date"
                    value={visitDate}
                    min={witaToday()}
                    max={witaDatePlus(14)}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="font-mono text-[14px]"
                    required
                  />
                </div>
              </Field>
              <p className="text-[12px] font-medium text-brand-ink flex items-center gap-1.5">
                <Calendar size={14} aria-hidden="true" />
                <span>{formatFriendlyDate(visitDate)}</span>
              </p>
            </div>

            {/* Pilihan Jam (Slot Waktu Ergonomis Tanpa Select Mentah) */}
            <div className="flex flex-col gap-2 pt-1 border-t border-line/60">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                  <Clock size={14} className="text-ink-muted" aria-hidden="true" />
                  {t('pool.choose_time_slot')}
                </span>
                <span className="font-mono text-[11px] text-ink-muted">WITA</span>
              </div>

              {timeSlots.length === 0 ? (
                <Notice tone="neutral">{t('service.no_slots')}</Notice>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {timeSlots.map((slot) => {
                    const isSelected = visitTime === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setVisitTime(slot)}
                        className={cx(
                          'flex h-11 items-center justify-center rounded-control font-mono text-[13.5px] transition-all',
                          isSelected
                            ? 'border-2 border-brand bg-brand-soft font-bold text-brand-ink'
                            : 'border border-line bg-card text-ink hover:border-line-strong',
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* 3. Alamat Lokasi Kolam (Collapsible Map Bebas Scroll Trap) */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title={t('pool.address_label')} className="mb-0" />
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
              collapsible={true}
              defaultExpanded={false}
            />
            <AddressNoteField
              id="pool-address-note"
              address={address}
              lat={addressCoords?.lat}
              lng={addressCoords?.lng}
              note={addressNote}
              onNoteChange={setAddressNote}
            />
          </Card>

          {/* 4. Metode Pembayaran & Promo */}
          <Card className="flex flex-col gap-3.5">
            <SectionHeader title={t('common.payment_method')} className="mb-0" />
            <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
              {WALLET_ENABLED && !isCustom && (
                <ChoiceCard
                  selected={paymentMethod === 'WiraPay'}
                  onClick={() => setPaymentMethod('WiraPay')}
                  leading={
                    <IconTile tone="pay" size="sm">
                      <Wallet size={18} />
                    </IconTile>
                  }
                  title="WiraPay"
                  subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
                />
              )}
              <ChoiceCard
                selected={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                leading={
                  <IconTile tone="success" size="sm">
                    <Banknote size={18} />
                  </IconTile>
                }
                title={t('common.pay_cash')}
                subtitle={isPackage ? t('pool.package_cash_desc') : t('pool.cash_desc')}
              />
              {!isPackage && !isCustom && (
                <ChoiceCard
                  selected={paymentMethod === 'QRIS'}
                  onClick={() => setPaymentMethod('QRIS')}
                  leading={
                    <IconTile tone="neutral" size="sm">
                      <QrCode size={18} />
                    </IconTile>
                  }
                  title={t('common.pay_qris')}
                  subtitle={t('common.pay_qris_desc')}
                />
              )}
            </div>

            {paymentMethod === 'WiraPay' && balance < calculateFinalPrice() && (
              <Notice tone="danger">
                {isPackage ? t('pool.package_insufficient') : t('pool.insufficient_balance')}
              </Notice>
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

            {/* Input Promo */}
            {isCustom && <p className="text-[12px] text-ink-muted">{t('pool.custom_no_promo')}</p>}
            {!isPackage && !isCustom && (
              <div className="border-t border-line/60 pt-3">
                <PromoField
                  id="pool-promo"
                  activePromo={activePromo}
                  promoCode={promoCode}
                  setPromoCode={setPromoCode}
                  onApply={handleCheckPromo}
                  onRemove={handleRemovePromo}
                  checking={checkingPromo}
                  error={promoError}
                />
              </div>
            )}

            {/* Rincian Biaya */}
            <dl className="flex flex-col gap-2 border-t border-line/60 pt-3 text-[13px]">
              <SummaryRow label="Biaya Layanan">
                <Money value={selectedService?.price || 0} />
              </SummaryRow>
              {activePromo && !isCustom && (
                <SummaryRow label="Diskon Promo">
                  <Money value={(selectedService?.price || 0) - calculateFinalPrice()} sign="minus" tone="in" />
                </SummaryRow>
              )}
              <SummaryRow label={t('pool.total_label')} strong className="mt-1 border-t border-line pt-2 text-[14px]">
                <Money value={calculateFinalPrice()} className="text-[18px] font-medium text-ink" />
              </SummaryRow>
            </dl>
          </Card>

          {/* STICKY BOTTOM CONFIRM BAR (LANGKAH 2) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-[var(--sidebar-w,16rem)] md:px-8 transition-[left] duration-200 pointer-events-none">
            <div className="mx-auto flex max-w-3xl items-stretch gap-2.5 rounded-card border border-line bg-card p-2.5 shadow-pop pointer-events-auto">
              <Button
                type="submit"
                size="lg"
                className="flex-1"
                disabled={loading || !visitTime || !address.trim()}
                isLoading={loading}
              >
                {loading
                  ? t('common.processing')
                  : !address.trim()
                  ? t('common.address_required')
                  : withMoney(t('pool.submit') + ' • ' + SLOT, calculateFinalPrice())}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
