import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  MapPin,
  BedDouble,
  Wallet,
  QrCode,
  Home,
  Users,
  ArrowRight,
  Calendar,
  Minus,
  Plus,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  Segmented,
  EmptyState,
  cx,
} from '../components/ui';
import SafeImg from '../components/ui/SafeImg';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import API_BASE_URL from '../config/api';
import StayCalendar, { nightsBetween } from '../components/villa/StayCalendar';
import { useTranslation } from '../i18n';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import PromoField from '../components/common/PromoField';
import { WALLET_ENABLED } from '../config/wallet';

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

const VILLA_REQUEST_CODES = ['early_checkin', 'late_checkout', 'extra_bed', 'airport_pickup', 'other'];

export default function VillaPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  const [villas, setVillas] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [area, setArea] = useState('Semua');
  const areas = ['Semua', 'Senggigi', 'Kuta', 'Sembalun', 'Tetebatu'];

  useEffect(() => {
    const fetchVillas = async () => {
      setFetchLoading(true);
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('service_type', 'villa')
        .eq('listing_status', 'approved')
        .neq('is_open', false)
        .order('created_at', { ascending: false });

      if (data) {
        setVillas(
          data.map((v) => ({
            id: v.id,
            ownerId: v.owner_id,
            name: v.name,
            area: v.address || 'Lombok',
            rating: v.rating || 5.0,
            pricePerNight: v.price_per_night || 750000,
            image: v.photos?.[0] || v.image || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600',
            photos: v.photos?.length
              ? v.photos
              : [v.image || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600'],
            maxGuests: v.max_guests || 6,
            desc: v.description || t('villa.default_desc'),
            bedrooms: v.bedrooms || 2,
            amenities: v.amenities || [
              t('villa.default_amenity_wifi'),
              t('villa.default_amenity_pool'),
              t('villa.default_amenity_breakfast'),
            ],
          })),
        );
      }
      setFetchLoading(false);
    };
    fetchVillas();
  }, []);

  // Alur 2 Jendela: 'catalog' | 'detail' | 'checkout'
  const [view, setView] = useState('catalog');
  const [selectedVilla, setSelectedVilla] = useState(null);

  // Tanggal Inap (Check-in & Check-out)
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  // Jumlah Tamu
  const [guests, setGuests] = useState(2);

  // Permintaan Khusus
  const [requests, setRequests] = useState({});

  // Pembayaran & Promo
  const [paymentMethod, setPaymentMethod] = useState('QRIS');
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  const openVilla = (villa) => {
    setSelectedVilla(villa);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setGuests(villa.maxGuests ? Math.min(2, villa.maxGuests) : 2);
    setCheckIn(null);
    setCheckOut(null);
    setRequests({});
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleRequest = (code) =>
    setRequests((r) => {
      const next = { ...r };
      if (code in next) delete next[code];
      else next[code] = '';
      return next;
    });

  const moreFromHost = useMemo(() => {
    if (!selectedVilla) return [];
    return villas.filter(
      (v) => v.ownerId && v.ownerId === selectedVilla.ownerId && v.id !== selectedVilla.id,
    );
  }, [selectedVilla, villas]);

  const filtered = useMemo(() => {
    return area === 'Semua'
      ? villas
      : villas.filter((v) => v.area.toLowerCase().includes(area.toLowerCase()));
  }, [area, villas]);

  const subtotalPrice = selectedVilla ? selectedVilla.pricePerNight * nights : 0;

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
      if (data.service_type && data.service_type !== 'villa') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  usePendingPromo('villa', promoCode, setPromoCode, handleCheckPromo);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const totalPrice = useMemo(() => {
    if (!activePromo) return subtotalPrice;
    if (activePromo.type === 'Percentage') {
      const discount = (subtotalPrice * activePromo.discount) / 100;
      return Math.max(0, subtotalPrice - discount);
    }
    return Math.max(0, subtotalPrice - activePromo.discount);
  }, [subtotalPrice, activePromo]);

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!checkIn || !checkOut || nights <= 0) {
      toast.error(t('villa.pick_dates'));
      return;
    }
    if (!user) {
      toast.error(t('common.login_required') || 'Silakan masuk ke akun Anda terlebih dahulu');
      navigate('/login');
      return;
    }
    if (paymentMethod === 'WiraPay' && balance < totalPrice) {
      toast.error(t('villa.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const bookingCode = 'VIL-' + Math.floor(10000 + Math.random() * 90000);

      const order = await addOrder({
        paymentDescription: `Reservasi Villa ${selectedVilla.name}`,
        merchantId: selectedVilla.id,
        service: 'WiraVilla',
        serviceType: 'villa',
        title: selectedVilla.name,
        details: `Kode: ${bookingCode} • ${nights} Malam (${checkIn}) • ${guests} Tamu`,
        price: totalPrice,
        paymentMethod: paymentMethod,
        nights,
        metadata: {
          check_in: checkIn,
          guests,
          ...(Object.keys(requests).length
            ? {
                villa_requests: Object.entries(requests).map(([code, note]) => ({
                  code,
                  note: note.trim() || null,
                })),
              }
            : {}),
        },
        promoCode: activePromo?.code || null,
      });

      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);

      // Alert pemilik villa via backend
      if (paymentMethod !== 'QRIS' && selectedVilla.ownerId && order?.id) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          fetch(`${API_BASE_URL}/notifications/order-alert`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              userId: selectedVilla.ownerId,
              title: 'Reservasi WiraVilla Baru!',
              body: `${selectedVilla.name} dipesan untuk ${nights} malam mulai ${checkIn}.`,
              data: { orderId: order.id, type: 'new_villa_order' },
            }),
          }).catch((err) => console.error('order-alert (villa owner) failed:', err));
        });
      }

      handleRemovePromo();
      if (paymentMethod !== 'QRIS') toast.success(t('villa.success'));
    } catch (err) {
      toast.error(t('villa.failed', { message: err.userMessage || friendlyError(err) }), {
        id: 'order-create-error',
      });
    } finally {
      setLoading(false);
    }
  };

  const [titleEyebrow, titleText] = splitTitle(t('villa.title'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-32">
      {/* ============================================================== */}
      {/* TAMPILAN 1: KATALOG VILLA                                     */}
      {/* ============================================================== */}
      {view === 'catalog' && (
        <>
          <PageHeader
            back="/"
            backLabel={t('common.back')}
            eyebrow={titleEyebrow}
            title={titleText}
            subtitle={t('villa.subtitle')}
            className="mb-0"
          />

          <Segmented
            scroll
            value={area}
            onChange={setArea}
            options={areas.map((a) => ({ value: a, label: a === 'Semua' ? t('villa.all_areas') : a }))}
          />

          {fetchLoading && villas.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
              {[0, 1].map((n) => (
                <div key={n} className="overflow-hidden rounded-card border border-line bg-card">
                  <div className="aspect-[16/10] animate-pulse bg-sunken" />
                  <div className="flex flex-col gap-2 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-sunken" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-sunken" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Home size={22} />} title={t('villa.empty')} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((villa) => (
                <Card
                  key={villa.id}
                  padding="none"
                  as="button"
                  type="button"
                  onClick={() => openVilla(villa)}
                  className="flex flex-col overflow-hidden text-left transition-all hover:border-line-strong"
                >
                  <div className="aspect-[16/10] bg-sunken">
                    <SafeImg
                      icon={Home}
                      src={villa.image}
                      alt={villa.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h3 className="text-balance text-[15px] font-bold leading-snug text-ink">{villa.name}</h3>
                        <p className="flex items-center gap-1 text-[12.5px] text-ink-muted">
                          <MapPin size={13} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{villa.area}</span>
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-ink">
                        <Star size={13} className="fill-pay text-pay" aria-hidden="true" />
                        <span className="font-mono">{villa.rating}</span>
                      </span>
                    </div>

                    <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                      <BedDouble size={14} className="shrink-0" aria-hidden="true" />
                      {t('villa.bedrooms_line', { count: villa.bedrooms })}
                    </p>

                    <ul className="flex flex-wrap gap-1.5">
                      {villa.amenities.map((am) => (
                        <li
                          key={am}
                          className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-[11.5px] font-medium text-ink-muted"
                        >
                          {am}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                      <p className="whitespace-nowrap">
                        <Money value={villa.pricePerNight} className="text-[16px] font-medium text-ink" />
                        <span className="text-[12px] text-ink-muted">{t('villa.per_night_short')}</span>
                      </p>
                      <Button size="sm" rightIcon={<ArrowRight size={14} />}>
                        {t('villa.view_and_book')}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* TAMPILAN 2: DETAIL VILLA & KALENDER TANGGAL INAP              */}
      {/* ============================================================== */}
      {view === 'detail' && selectedVilla && (
        <div className="flex flex-col gap-5">
          <PageHeader
            back="#"
            onBack={() => setView('catalog')}
            backLabel={t('villa.back_to_catalog')}
            title={selectedVilla.name}
            subtitle={
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} className="shrink-0" aria-hidden="true" /> {selectedVilla.area}
              </span>
            }
            className="mb-0"
          />

          {/* Galeri Foto Carousel */}
          <div className="overflow-hidden rounded-card border border-line bg-card">
            <div
              className="flex snap-x snap-mandatory overflow-x-auto"
              aria-label={t('villa.photo_count', { count: selectedVilla.photos.length })}
            >
              {selectedVilla.photos.map((src, i) => (
                <SafeImg
                  icon={Home}
                  key={src}
                  src={src}
                  alt={`${selectedVilla.name} ${i + 1}`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="h-56 w-full shrink-0 snap-center bg-sunken object-cover sm:h-72"
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-bold text-ink">
                  {withMoney(t('villa.per_night', { price: SLOT }), selectedVilla.pricePerNight, {
                    className: 'font-extrabold text-brand-ink',
                  })}
                </p>
                {selectedVilla.photos.length > 1 && (
                  <span className="font-mono text-[12px] text-ink-muted">
                    {t('villa.photo_count', { count: selectedVilla.photos.length })}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <Users size={14} aria-hidden="true" />
                  {t('villa.max_guests_line', { count: selectedVilla.maxGuests })}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <BedDouble size={14} aria-hidden="true" />
                  {t('villa.bedrooms_line', { count: selectedVilla.bedrooms })}
                </span>
              </div>

              {selectedVilla.desc && (
                <p className="text-[13px] leading-relaxed text-ink-muted pt-1">
                  {selectedVilla.desc}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 pt-2">
                {selectedVilla.amenities.map((am) => (
                  <span
                    key={am}
                    className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-[11.5px] font-medium text-ink-muted"
                  >
                    {am}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Kalender Pemilihan Tanggal Inap */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <SectionHeader title={t('villa.dates_label')} className="mb-0" />
              <p className="text-[12px] text-ink-muted">{t('villa.select_dates_hint')}</p>
            </div>

            <StayCalendar
              villaId={selectedVilla.id}
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={({ checkIn: ci, checkOut: co }) => {
                setCheckIn(ci);
                setCheckOut(co);
              }}
            />

            {/* Status Pilihan Tanggal */}
            <div className="rounded-control bg-sunken px-3.5 py-2.5 text-[13px]">
              {!checkIn ? (
                <p className="text-ink-muted">{t('villa.pick_checkin')}</p>
              ) : !checkOut ? (
                <p className="text-brand-ink font-semibold">
                  {t('villa.pick_checkout', {
                    date: new Date(`${checkIn}T00:00`).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                    }),
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">
                    {t('villa.stay_summary', {
                      from: new Date(`${checkIn}T00:00`).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                      }),
                      to: new Date(`${checkOut}T00:00`).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                      }),
                      count: nights,
                    })}
                  </span>
                  <Money value={subtotalPrice} className="font-mono font-bold text-brand-ink" />
                </div>
              )}
            </div>
          </Card>

          {/* Pengaturan Jumlah Tamu */}
          <Card className="flex items-center justify-between p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-bold text-ink">{t('villa.guests_label')}</span>
              <span className="text-[12px] text-ink-muted">
                {t('villa.max_guests_line', { count: selectedVilla.maxGuests })}
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-control border border-line-strong bg-card p-1">
              <button
                type="button"
                aria-label="Kurangi tamu"
                onClick={() => setGuests((g) => Math.max(1, g - 1))}
                disabled={guests <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink hover:bg-sunken disabled:opacity-30"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[36px] text-center font-mono text-[15px] font-bold text-ink">
                {guests}
              </span>
              <button
                type="button"
                aria-label="Tambah tamu"
                onClick={() => setGuests((g) => Math.min(selectedVilla.maxGuests || 20, g + 1))}
                disabled={guests >= (selectedVilla.maxGuests || 20)}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand text-white hover:bg-brand-hover disabled:opacity-30"
              >
                <Plus size={16} />
              </button>
            </div>
          </Card>

          {/* Rekomendasi Lain dari Tuan Rumah */}
          {moreFromHost.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <SectionHeader title={t('villa.more_from_host')} className="mb-0" />
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {moreFromHost.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => openVilla(v)}
                    className="flex w-44 shrink-0 flex-col overflow-hidden rounded-control border border-line bg-card text-left transition-colors hover:border-line-strong"
                  >
                    <SafeImg icon={Home} src={v.image} alt="" loading="lazy" className="h-20 w-full bg-sunken object-cover" />
                    <span className="truncate px-2.5 pt-1.5 text-[12.5px] font-semibold text-ink">{v.name}</span>
                    <Money value={v.pricePerNight} className="px-2.5 pb-2 text-[12px] text-ink-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STICKY BOTTOM BAR (DETAIL STEP) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-card bg-brand py-2.5 pl-4 pr-2.5 text-white shadow-pop">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[12px] text-white/80">
                  {nights > 0 ? `${nights} Malam • ${guests} Tamu` : 'Tentukan tanggal menginap'}
                </p>
                <Money value={subtotalPrice || selectedVilla.pricePerNight} className="text-[17px] font-medium" />
              </div>
              <Button
                variant="on-brand"
                size="md"
                disabled={!nights || nights <= 0}
                rightIcon={<ArrowRight size={16} />}
                onClick={() => {
                  setView('checkout');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {t('villa.proceed_to_booking')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAMPILAN 3: KONFIRMASI RESERVASI & PEMBAYARAN                 */}
      {/* ============================================================== */}
      {view === 'checkout' && selectedVilla && (
        <form onSubmit={handleConfirmBooking} className="flex flex-col gap-4">
          <PageHeader
            back="#"
            onBack={() => setView('detail')}
            backLabel={t('villa.back_to_detail')}
            title={t('villa.step_checkout_title')}
            subtitle={selectedVilla.name}
            className="mb-0"
          />

          {/* 1. Ringkasan Reservasi */}
          <Card className="flex flex-col gap-3 border-brand-line bg-brand-soft/30 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-ink">
                  {t('villa.booking_summary_title')}
                </span>
                <h3 className="truncate text-[15px] font-bold text-ink">{selectedVilla.name}</h3>
                <p className="flex items-center gap-1 text-[12px] text-ink-muted">
                  <MapPin size={13} className="shrink-0" aria-hidden="true" />
                  <span>{selectedVilla.area}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setView('detail');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="shrink-0 rounded-control border border-brand/30 bg-card px-3 py-1.5 text-xs font-bold text-brand-ink hover:bg-sunken transition-colors"
              >
                {t('villa.change_dates')}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between border-t border-brand/20 pt-2 text-[13px]">
              <span className="flex items-center gap-1.5 text-ink">
                <Calendar size={14} className="text-brand-ink" aria-hidden="true" />
                <span>
                  {new Date(`${checkIn}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  {' → '}
                  {new Date(`${checkOut}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </span>
                <span className="font-semibold text-brand-ink">({nights} malam)</span>
              </span>
              <span className="flex items-center gap-1 text-ink-muted">
                <Users size={14} aria-hidden="true" />
                <span>{guests} tamu</span>
              </span>
            </div>
          </Card>

          {/* 2. Permintaan Khusus (Special Requests) */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <SectionHeader title={t('villareq.booking_title')} className="mb-0" />
              <p className="text-[12px] text-ink-muted">{t('villareq.booking_hint')}</p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {VILLA_REQUEST_CODES.map((code) => (
                <div key={code} className="flex flex-col gap-1.5">
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
                    <input
                      type="checkbox"
                      checked={code in requests}
                      onChange={() => toggleRequest(code)}
                      className="h-[18px] w-[18px] rounded border-line-strong accent-[rgb(var(--brand))]"
                    />
                    <span>{t(`villareq.code_${code}`)}</span>
                  </label>
                  {code in requests && (
                    <Input
                      aria-label={t('villareq.note_label')}
                      value={requests[code]}
                      maxLength={120}
                      onChange={(e) => setRequests((r) => ({ ...r, [code]: e.target.value }))}
                      placeholder={t(`villareq.note_${code}`)}
                      className="min-h-9 py-1.5 text-[13px]"
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 3. Metode Pembayaran & Promo */}
          <Card className="flex flex-col gap-3.5">
            <SectionHeader title={t('common.payment_method')} className="mb-0" />
            <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
              {WALLET_ENABLED && (
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
            </div>

            {paymentMethod === 'WiraPay' && balance < totalPrice && (
              <Notice tone="danger">{t('villa.insufficient_balance')}</Notice>
            )}

            {/* Input Promo */}
            <div className="border-t border-line/60 pt-3">
              <PromoField
                t={t}
                id="villa-promo"
                activePromo={activePromo}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                onApply={handleCheckPromo}
                onRemove={handleRemovePromo}
                checking={checkingPromo}
                error={promoError}
              />
            </div>

            {/* Rincian Total Biaya */}
            <dl className="flex flex-col gap-2 border-t border-line/60 pt-3 text-[13px]">
              <SummaryRow label={`Sewa Villa (${nights} malam)`}>
                <Money value={subtotalPrice} />
              </SummaryRow>
              {activePromo && (
                <SummaryRow label="Diskon Promo">
                  <Money value={subtotalPrice - totalPrice} sign="minus" tone="in" />
                </SummaryRow>
              )}
              <SummaryRow label={t('villa.total_label', { count: nights })} strong className="mt-1 border-t border-line pt-2 text-[14px]">
                <Money value={totalPrice} className="text-[18px] font-medium text-ink" />
              </SummaryRow>
            </dl>
          </Card>

          {/* STICKY BOTTOM CONFIRM BAR (CHECKOUT STEP) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-stretch gap-2.5 rounded-card border border-line bg-card p-2.5 shadow-pop">
              <Button
                type="submit"
                size="lg"
                className="flex-1"
                disabled={loading || !nights || nights <= 0}
                isLoading={loading}
              >
                {loading
                  ? t('common.processing')
                  : withMoney(t('villa.submit') + ' • ' + SLOT, totalPrice)}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
