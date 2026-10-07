import { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import {
  Button,
  Card,
  Badge,
  Money,
  IconTile,
  Field,
  Input,
  Notice,
  PageHeader,
  SectionHeader,
  EmptyState,
  Spinner,
  cx,
} from '../components/ui';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import SavedAddressPicker from '../components/common/SavedAddressPicker';
import {
  Star,
  Clock,
  Minus,
  Plus,
  ShoppingBag,
  MapPin,
  ArrowLeft,
  ArrowRight,
  Store,
  LocateFixed,
  Wallet,
  Banknote,
} from 'lucide-react';
import { fetchRoute, fetchCoordinates } from '../utils/osmHelpers';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../i18n';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { usePendingPromo } from '../utils/pendingPromo';

// Placeholder used to drop a <Money> into a translated sentence, so an
// amount inside "Pesan Sekarang • {{price}}" still renders in mono.
const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

// Selectable option (Tenun Laut): 2px brand border + radio when selected.
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

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export default function RestaurantPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [rest, setRest] = useState(null);

  const { cart, addItem, removeItem, updateQty, subtotal, clearCart } = useCart();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  const [step, setStep] = useState('menu'); // 'menu', 'checkout', 'tracking'
  const [deliveryAddress, setDeliveryAddress] = useState('Jl. Pejanggik No. 8, Mataram');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState({ lat: -8.5833, lng: 116.1167 });
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [merchantCoords, setMerchantCoords] = useState(null);
  const [distance, setDistance] = useState(0);
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState(5000);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const fetchRest = async () => {
      setFetchError(false);
      // Ambil data restoran
      const { data: merchantData, error: merchantError } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', id)
        .single();

      if (merchantError || !merchantData) {
        console.error(merchantError);
        setFetchError(true);
        return;
      }

      if (merchantData) {
        // Ambil data menu (products)
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('merchant_id', id);
          
        setRest({
          ...merchantData,
          deliveryTime: merchantData.delivery_time,
          menuItems: productsData || []
        });

        let mCoords = { lat: -8.5833, lng: 116.1167 };
        if (merchantData.lat && merchantData.lng) {
          mCoords = { lat: parseFloat(merchantData.lat), lng: parseFloat(merchantData.lng) };
        } else if (merchantData.address) {
          const coords = await fetchCoordinates(merchantData.address);
          if (coords) mCoords = coords;
        }
        setMerchantCoords(mCoords);
      }
    };
    if (id) fetchRest();
  }, [id]);


  useEffect(() => {
    if (merchantCoords && deliveryCoords) {
      const getRoute = async () => {
        const res = await fetchRoute(merchantCoords, deliveryCoords);
        if (res && res.distance) {
          const distKm = res.distance / 1000;
          setDistance(distKm);
          setDynamicDeliveryFee(5000 + (Math.ceil(distKm) * 2000));
        } else {
          setDynamicDeliveryFee(8000);
        }
      };
      getRoute();
    }
  }, [merchantCoords, deliveryCoords]);

  // A code chosen with "Use now" on the home promos (utils/pendingPromo); the
  // check itself is defined below the loading returns, hence the ref.
  const applyPromoRef = useRef(null);
  usePendingPromo('food', promoCode, setPromoCode, () => applyPromoRef.current?.(), !!rest);

  if (fetchError) {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState
          icon={<Store size={24} />}
          title={t('restaurant.not_found_title')}
          description={t('restaurant.not_found_desc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
              <Button onClick={() => navigate('/food')}>{t('restaurant.back_to_food')}</Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!rest) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status">
        <Spinner size={24} className="text-brand-ink" />
        <p className="text-sm">{t('restaurant.loading')}</p>
      </div>
    );
  }

  const grandTotal = Math.max(0, subtotal + dynamicDeliveryFee - discount);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error(t('location.unsupported'));
      return;
    }
    const toastId = toast.loading(t('location.searching'));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDeliveryCoords(latLng);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
          const data = await res.json();
          if (data && data.display_name) {
            setDeliveryAddress(data.display_name);
          }
        } catch (e) {
          console.error(e);
        }
        toast.success(t('location.found'), { id: toastId });
      },
      (error) => {
        console.error('GPS Error:', error);
        let errorMsg = t('location.failed');
        if (error.code === 1) errorMsg = t('location.denied');
        else if (error.code === 2) errorMsg = t('location.unavailable');
        else if (error.code === 3) errorMsg = t('location.timeout');
        toast.error(errorMsg, { id: toastId, duration: 6000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const handleMarkerDrag = async (idx, latLng) => {
    setDeliveryCoords(latLng);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
      const data = await res.json();
      if (data && data.display_name) setDeliveryAddress(data.display_name);
    } catch (e) {
      console.error(e);
    }
  };

  // Real, DB-backed promo check against the promos table - replaces a
  // previous hardcoded 'WIRALOMBOK'/'DISKON10' string-match stub that gave
  // a flat Rp10.000 discount and completely bypassed the promos table (no
  // expiry, status, or per-service validation, no usage tracking).
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
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error(t('promo.expired'));
      if (data.service_type && data.service_type !== 'food') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      const promoDiscount = data.type === 'Percentage'
        ? Math.round((subtotal * Number(data.discount)) / 100)
        : Number(data.discount) || 0;
      setDiscount(Math.max(0, Math.min(promoDiscount, subtotal)));
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
      setActivePromo(null);
      setDiscount(0);
    } finally {
      setCheckingPromo(false);
    }
  };
  applyPromoRef.current = handleCheckPromo;

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setDiscount(0);
  };

  const handleConfirmOrder = async () => {
    if (cart.items.length === 0) {
      toast.error(t('restaurant.empty_cart'));
      return;
    }
    // RestaurantPage is already mounted under Layout, which redirects any
    // unauthenticated visitor to /login before this page can even render -
    // so this is defense-in-depth (e.g. a session expiring mid-checkout
    // without a reload) rather than the primary guard; addOrder() and the
    // DB (migrations/0074) also refuse to create an order without a login.
    if (!user) {
      toast.error(t('restaurant.login_required'));
      navigate('/login');
      return;
    }
    if (paymentMethod === 'WiraPay' && balance < grandTotal) {
      toast.error(t('restaurant.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const itemsSummary = cart.items.map((i) => `${i.qty}x ${i.name}`).join(', ');

      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraFood - ${rest.name}`,
        serviceType: 'food',
        merchantId: rest.id,
        title: rest.name,
        details: `${itemsSummary} — Antar ke: ${withAddressNote(deliveryAddress, deliveryNote)}`,
        price: grandTotal,
        deliveryFee: dynamicDeliveryFee,
        dropoffLat: deliveryCoords.lat,
        dropoffLng: deliveryCoords.lng,
        pickupLat: merchantCoords?.lat,
        pickupLng: merchantCoords?.lng,
        paymentMethod: paymentMethod,
        metadata: { items: cart.items, subtotal: subtotal, discount: discount },
        // `distance` state holds the route distance in km (see the
        // merchantCoords/deliveryCoords effect above, which derives it from
        // fetchRoute's res.distance in meters) - convert back to meters for
        // the 0059 trigger's food delivery_fee recomputation, reusing the
        // exact same route fetch rather than calling fetchRoute again.
        distanceMeters: distance > 0 ? Math.round(distance * 1000) : null,
        promoCode: activePromo?.code || null,
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      clearCart();
      handleRemovePromo(); // don't let a used promo silently discount the next order
      toast.success(t('restaurant.order_placed'));
    } catch (err) {
      toast.error(t('restaurant.order_failed', { message: err.message }));
    }
    setLoading(false);
  };

  // merchants.is_open is toggled by the merchant in Wira Mitra.
  const isClosed = rest.is_open === false;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-28">
      <PageHeader
        back="/food"
        backLabel={t('common.back')}
        eyebrow={rest.category}
        title={rest.name}
        subtitle={rest.address ? (
          <span className="inline-flex items-start gap-1">
            <MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" /> {rest.address}
          </span>
        ) : null}
        className="mb-0"
      />

      {/* TAMPILAN 1: DAFTAR MENU MAKANAN */}
      {step === 'menu' && (
        <>
          <Card padding="none" className="overflow-hidden">
            <img
              src={rest.image}
              alt={rest.name}
              className="h-44 w-full bg-sunken object-cover sm:h-56"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Star size={14} className="fill-current" aria-hidden="true" />
                <span className="font-mono">{rest.rating ?? '–'}</span>
              </span>
              {rest.deliveryTime && (
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Clock size={14} aria-hidden="true" />
                  <span className="font-mono">{rest.deliveryTime}</span>
                </span>
              )}
              {isClosed
                ? <Badge tone="neutral" dot className="ml-auto">{t('restaurant.closed')}</Badge>
                : <Badge tone="success" dot className="ml-auto">{t('restaurant.open_now')}</Badge>}
            </div>
          </Card>

          {isClosed && <Notice tone="warning">{t('restaurant.closed_notice')}</Notice>}

          <section>
            <SectionHeader title={t('restaurant.menu_title')} />
            <Card padding="none" className="divide-y divide-line overflow-hidden">
              {rest.menuItems.map((item) => {
                const inCart = cart.items.find((i) => i.id === item.id);
                const isAvailable = item.is_available ?? true;
                return (
                  <div
                    key={item.id}
                    className={cx('flex gap-3.5 p-3.5', !isAvailable && 'opacity-60')}
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-20 w-20 shrink-0 rounded-control bg-sunken object-cover"
                      />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="text-[14px] font-semibold leading-snug text-ink">{item.name}</h3>
                      {item.description && (
                        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Money value={item.price} className="text-[14px] font-medium text-ink" />

                        {!isAvailable ? (
                          <Badge tone="neutral">{t('restaurant.sold_out')}</Badge>
                        ) : inCart ? (
                          <div className="inline-flex items-center rounded-control border border-line-strong bg-card">
                            <button
                              type="button"
                              aria-label={`− ${item.name}`}
                              onClick={() => {
                                if (inCart.qty > 1) {
                                  updateQty(item.id, inCart.qty - 1);
                                } else {
                                  removeItem(item.id);
                                }
                              }}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-l-control text-ink hover:bg-sunken"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="min-w-[28px] text-center font-mono text-[14px] font-medium text-ink" aria-live="polite">
                              {inCart.qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`+ ${item.name}`}
                              onClick={() => addItem({ ...item, qty: 1 })}
                              disabled={isClosed}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-r-control text-brand-ink hover:bg-brand-soft disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        ) : (
                          <Button
                            variant="secondary"
                            disabled={isClosed}
                            leftIcon={<Plus size={16} />}
                            onClick={() => {
                              addItem({ ...item, qty: 1 });
                              toast.success(t('restaurant.added_to_cart', { name: item.name }));
                            }}
                          >
                            {t('restaurant.add')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        </>
      )}

      {/* BAR KERANJANG TERAPUNG DI BAWAH */}
      {cart.items.length > 0 && step === 'menu' && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-card bg-brand py-2.5 pl-3 pr-2.5 text-white shadow-pop">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-white/10" aria-hidden="true">
              <ShoppingBag size={20} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-[12px] text-white/75">
                {t('restaurant.items_selected', { count: cart.items.reduce((acc, curr) => acc + curr.qty, 0) })}
              </p>
              <Money value={subtotal} className="text-[16px] font-medium" />
            </div>
            <Button
              variant="on-brand"
              rightIcon={<ArrowRight size={16} />}
              disabled={isClosed}
              onClick={() => setStep('checkout')}
            >
              {t('restaurant.to_checkout')}
            </Button>
          </div>
        </div>
      )}

      {/* TAMPILAN 2: HALAMAN CHECKOUT LENGKAP */}
      {step === 'checkout' && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <SectionHeader title={t('restaurant.delivery_address')} className="mb-0" />
            <div className="relative z-10">
              <LocationAutocomplete
                placeholder={t('restaurant.delivery_address_placeholder')}
                icon={MapPin}
                iconColor="text-danger"
                value={deliveryAddress}
                onChange={setDeliveryAddress}
                onSelect={(loc) => setDeliveryCoords({ lat: loc.lat, lng: loc.lng })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <SavedAddressPicker
                onSelect={({ address, lat, lng, note }) => {
                  setDeliveryAddress(address);
                  setDeliveryCoords({ lat, lng });
                  setDeliveryNote(note || '');
                }}
              />
              <button
                type="button"
                onClick={handleLocateMe}
                className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-semibold text-brand-ink hover:underline"
              >
                <LocateFixed size={15} aria-hidden="true" /> {t('common.use_current_location')}
              </button>
            </div>
            <AddressNoteField
              id="delivery-note"
              address={deliveryAddress}
              lat={deliveryCoords?.lat}
              lng={deliveryCoords?.lng}
              note={deliveryNote}
              onNoteChange={setDeliveryNote}
            />
            <div className="h-44 overflow-hidden rounded-card border border-line">
              <WiraMap
                center={deliveryCoords}
                zoom={16}
                markers={[{ ...deliveryCoords, type: 'dropoff', label: t('restaurant.delivery_pin_label') }]}
                onMarkerDragEnd={handleMarkerDrag}
              />
            </div>
            <p className="text-xs text-ink-muted">{t('common.map_pin_hint')}</p>
          </Card>

          {/* Rincian Pesanan */}
          <Card className="flex flex-col gap-4">
            <SectionHeader title={t('restaurant.order_summary')} className="mb-0" />
            <ul className="flex flex-col gap-2.5">
              {cart.items.map((i) => (
                <li key={i.id} className="flex items-baseline gap-3 text-[13.5px]">
                  <span className="w-8 shrink-0 font-mono text-ink-muted">{i.qty}x</span>
                  <span className="min-w-0 flex-1 font-semibold text-ink">{i.name}</span>
                  <Money value={i.price * i.qty} className="text-ink" />
                </li>
              ))}
            </ul>

            {/* Input Promo */}
            <div className="border-t border-line pt-4">
              {activePromo ? (
                <Notice
                  tone="success"
                  action={
                    <Button variant="ghost" size="sm" onClick={handleRemovePromo} className="-my-1.5">
                      {t('common.remove')}
                    </Button>
                  }
                >
                  {t('promo.applied', { code: activePromo.code })}
                </Notice>
              ) : (
                <Field label={t('promo.placeholder')} htmlFor="food-promo" error={promoError || undefined}>
                  <div className="flex gap-2">
                    <Input
                      id="food-promo"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      invalid={!!promoError}
                      autoCapitalize="characters"
                      className="min-w-0 flex-1 font-mono uppercase"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleCheckPromo}
                      disabled={checkingPromo || !promoCode.trim()}
                      className="shrink-0"
                    >
                      {checkingPromo ? t('promo.checking') : t('promo.apply')}
                    </Button>
                  </div>
                </Field>
              )}
            </div>

            {/* Hitung Rincian */}
            <dl className="flex flex-col gap-2 border-t border-line pt-4 text-[13px]">
              <SummaryRow label={t('restaurant.subtotal')}>
                <Money value={subtotal} />
              </SummaryRow>
              <SummaryRow label={t('restaurant.delivery_fee')}>
                <Money value={dynamicDeliveryFee} />
              </SummaryRow>
              {distance > 0 && (
                <SummaryRow label={t('restaurant.delivery_distance')} className="text-[12px]">
                  <span className="font-mono text-ink-muted">{distance.toFixed(1)} km</span>
                </SummaryRow>
              )}
              {discount > 0 && (
                <SummaryRow label={t('restaurant.discount')}>
                  <Money value={discount} sign="minus" tone="in" />
                </SummaryRow>
              )}
              <SummaryRow label={t('restaurant.grand_total')} strong className="mt-1 border-t border-line pt-3 text-[14px]">
                <Money value={grandTotal} className="text-[17px] font-medium" />
              </SummaryRow>
            </dl>
          </Card>

          {/* Metode Pembayaran */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title={t('restaurant.choose_payment')} className="mb-0" />
            <div role="radiogroup" aria-label={t('restaurant.choose_payment')} className="flex flex-col gap-2.5">
              <ChoiceCard
                selected={paymentMethod === 'WiraPay'}
                onClick={() => setPaymentMethod('WiraPay')}
                leading={<IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>}
                title="WiraPay"
                subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
              />
              <ChoiceCard
                selected={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                leading={<IconTile tone="neutral" size="sm"><Banknote size={18} /></IconTile>}
                title={t('common.pay_cash_cod')}
                subtitle={t('common.pay_cash_to_courier')}
              />
            </div>
            {paymentMethod === 'WiraPay' && balance < grandTotal && (
              <Notice tone="danger">{t('restaurant.insufficient_balance')}</Notice>
            )}
          </Card>

          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-stretch gap-2.5 rounded-card border border-line bg-card p-2.5 shadow-pop">
              <Button
                variant="secondary"
                size="lg"
                aria-label={t('common.back')}
                title={t('common.back')}
                className="shrink-0 px-4"
                onClick={() => setStep('menu')}
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={handleConfirmOrder}
                disabled={loading || isClosed}
                isLoading={loading}
              >
                {loading ? t('common.processing') : withMoney(t('restaurant.place_order', { price: SLOT }), grandTotal)}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
