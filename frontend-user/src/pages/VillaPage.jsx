import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, BedDouble, Wallet, QrCode, Home } from 'lucide-react';
import {
  Button,
  Card,
  Sheet,
  Field,
  Select,
  Money,
  IconTile,
  Notice,
  PageHeader,
  Segmented,
  EmptyState,
  cx,
} from '../components/ui';
import SafeImg from '../components/ui/SafeImg';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
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

export default function VillaPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

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
        // Only live, bookable properties (migration 0097: hosts add villas
        // that wait for an admin, and can pause one at a time).
        .eq('listing_status', 'approved')
        .neq('is_open', false)
        .order('created_at', { ascending: false });
      
      if (data) {
        setVillas(data.map(v => ({
          id: v.id,
          ownerId: v.owner_id,
          name: v.name,
          area: v.address || 'Lombok',
          rating: v.rating || 5.0,
          pricePerNight: v.price_per_night || 750000,
          image: v.photos?.[0] || v.image || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600',
          photos: v.photos?.length ? v.photos : [v.image || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600'],
          maxGuests: v.max_guests || null,
          desc: v.description || t('villa.default_desc'),
          bedrooms: v.bedrooms || 2,
          // Merchant-supplied amenities are data and stay untouched; only
          // this placeholder set (shown when a villa has none yet) follows
          // the customer's language.
          amenities: v.amenities || [
            t('villa.default_amenity_wifi'),
            t('villa.default_amenity_pool'),
            t('villa.default_amenity_breakfast'),
          ]
        })));
      }
      setFetchLoading(false);
    };
    fetchVillas();
  }, []);

  // Modal State
  const [selectedVilla, setSelectedVilla] = useState(null);
  // Stay picked on the availability calendar (migrations/0104).
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const [guests, setGuests] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState('QRIS');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  const openVilla = (villa) => {
    setSelectedVilla(villa);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setGuests((g) => (villa.maxGuests ? Math.min(g, villa.maxGuests) : g));
    setCheckIn(null);
    setCheckOut(null);
  };
  const guestOptions = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20].filter((g) => !selectedVilla?.maxGuests || g <= selectedVilla.maxGuests);
  if (selectedVilla?.maxGuests && !guestOptions.includes(selectedVilla.maxGuests)) guestOptions.push(selectedVilla.maxGuests);
  const moreFromHost = selectedVilla ? villas.filter((v) => v.ownerId && v.ownerId === selectedVilla.ownerId && v.id !== selectedVilla.id) : [];

  const filtered = area === 'Semua' ? villas : villas.filter((v) => v.area.toLowerCase().includes(area.toLowerCase()));

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
  // A code chosen with "Use now" on the home promos (utils/pendingPromo).
  usePendingPromo('villa', promoCode, setPromoCode, handleCheckPromo);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const totalPrice = (() => {
    if (!activePromo) return subtotalPrice;
    if (activePromo.type === 'Percentage') {
      const discount = (subtotalPrice * activePromo.discount) / 100;
      return Math.max(0, subtotalPrice - discount);
    }
    return Math.max(0, subtotalPrice - activePromo.discount);
  })();

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!checkIn || !checkOut) {
      toast.error(t('villa.pick_dates'));
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
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `Reservasi Villa ${selectedVilla.name}`,
        merchantId: selectedVilla.id,
        service: 'WiraVilla',
        serviceType: 'villa',
        title: selectedVilla.name,
        details: `Kode: ${bookingCode} • ${nights} Malam (${checkIn}) • ${guests} Tamu`,
        price: totalPrice,
        paymentMethod: paymentMethod,
        nights,
        metadata: { check_in: checkIn, guests },
        promoCode: activePromo?.code || null,
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      setSelectedVilla(null);

      // A villa booking is relevant to exactly ONE recipient - the villa's
      // owning merchant (merchants.owner_id, captured on `selectedVilla`
      // above) - unlike Ride/Send this is never a nearby-drivers fan-out.
      // Single order-alert call, best-effort/fire-and-forget so a missing
      // fcm_token or network hiccup never blocks the customer's booking.
      // QRIS bookings are announced by the payment webhook once paid
      // (backend/routes/mutasiku.js), not while still unpaid.
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

      handleRemovePromo(); // don't let a used promo silently discount the next booking
      if (paymentMethod !== 'QRIS') toast.success(t('villa.success'));
    } catch (err) {
      toast.error(t('villa.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

  const [titleEyebrow, titleText] = splitTitle(t('villa.title'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        eyebrow={titleEyebrow}
        title={titleText}
        subtitle={t('villa.subtitle')}
        className="mb-0"
      />

      {/* Filter Area Tabs */}
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
        /* Daftar Kartu Villa */
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((villa) => (
            <Card
              key={villa.id}
              padding="none"
              onClick={() => openVilla(villa)}
              className="flex flex-col overflow-hidden"
            >
              <div className="aspect-[16/10] bg-sunken">
                <SafeImg icon={Home}
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
                    <Star size={13} className="fill-current" aria-hidden="true" />
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
                  <Button>{t('villa.view_and_book')}</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* SHEET RESERVASI VILLA */}
      <Sheet
        open={!!selectedVilla}
        onClose={() => setSelectedVilla(null)}
        size="lg"
        closeLabel={t('common.close')}
        title={selectedVilla ? t('villa.reserve_title', { name: selectedVilla.name }) : undefined}
        description={selectedVilla ? t('villa.location_line', { area: selectedVilla.area }) : undefined}
        footer={
          <Button type="submit" form="villa-booking-form" size="lg" block disabled={loading || !nights} isLoading={loading}>
            {loading ? t('common.processing') : t('villa.submit')}
          </Button>
        }
      >
        {selectedVilla && (
          <form id="villa-booking-form" onSubmit={handleConfirmBooking} className="flex flex-col gap-5">
            <div className="overflow-hidden rounded-card border border-line bg-card">
              <div className="flex snap-x snap-mandatory overflow-x-auto" aria-label={t('villa.photo_count', { count: selectedVilla.photos.length })}>
                {selectedVilla.photos.map((src, i) => (
                  <SafeImg icon={Home}
                    key={src}
                    src={src}
                    alt={`${selectedVilla.name} ${i + 1}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    className="h-48 w-full shrink-0 snap-center bg-sunken object-cover sm:h-56"
                  />
                ))}
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-ink">
                  <span>{withMoney(t('villa.per_night', { price: SLOT }), selectedVilla.pricePerNight, { className: 'font-medium' })}</span>
                  {selectedVilla.photos.length > 1 && (
                    <span className="font-mono text-[11.5px] text-ink-muted">{t('villa.photo_count', { count: selectedVilla.photos.length })}</span>
                  )}
                </p>
                {selectedVilla.maxGuests && (
                  <p className="text-[12.5px] text-ink-muted">{t('villa.max_guests_line', { count: selectedVilla.maxGuests })}</p>
                )}
                {selectedVilla.desc && <p className="text-[13px] leading-relaxed text-ink-muted">{selectedVilla.desc}</p>}
              </div>
            </div>

            {moreFromHost.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{t('villa.more_from_host')}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
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

            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-ink">{t('villa.dates_label')}</p>
              <StayCalendar
                villaId={selectedVilla.id}
                checkIn={checkIn}
                checkOut={checkOut}
                onChange={({ checkIn: ci, checkOut: co }) => { setCheckIn(ci); setCheckOut(co); }}
              />
              <p className="text-[13px] text-ink-muted" aria-live="polite">
                {!checkIn ? t('villa.pick_checkin')
                  : !checkOut ? t('villa.pick_checkout', { date: new Date(`${checkIn}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) })
                    : t('villa.stay_summary', {
                      from: new Date(`${checkIn}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                      to: new Date(`${checkOut}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                      count: nights,
                    })}
              </p>
            </div>

            <Field label={t('villa.guests_label')} htmlFor="villa-guests">
              <Select
                id="villa-guests"
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
              >
                {guestOptions.map((g) => (
                  <option key={g} value={g}>
                    {t('villa.guests_option', { count: g })}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Pilihan Metode Bayar */}
            <div className="flex flex-col gap-2">
              <GroupLabel>{t('common.payment_method')}</GroupLabel>
              <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
                {WALLET_ENABLED && (
                  <ChoiceCard
                    selected={paymentMethod === 'WiraPay'}
                    onClick={() => setPaymentMethod('WiraPay')}
                    leading={<IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>}
                    title="WiraPay"
                    subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
                  />
                )}
                <ChoiceCard
                  selected={paymentMethod === 'QRIS'}
                  onClick={() => setPaymentMethod('QRIS')}
                  leading={<IconTile tone="neutral" size="sm"><QrCode size={18} /></IconTile>}
                  title={t('common.pay_qris')}
                  subtitle={t('common.pay_qris_desc')}
                />
              </div>
              {paymentMethod === 'WiraPay' && balance < totalPrice && (
                <Notice tone="danger">{t('villa.insufficient_balance')}</Notice>
              )}
            </div>

            {/* Kode Promo */}
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

            {/* Total Biaya */}
            <dl className="flex flex-col rounded-card border border-line bg-card p-4 text-[13px]">
              <SummaryRow label={t('villa.total_label', { count: nights })} strong className="text-[14px]">
                <span className="flex flex-col items-end">
                  {activePromo && <Money value={subtotalPrice} tone="muted" className="text-[12px] line-through" />}
                  <Money value={totalPrice} className="text-[17px] font-medium" />
                </span>
              </SummaryRow>
            </dl>
          </form>
        )}
      </Sheet>
    </div>
  );
}
