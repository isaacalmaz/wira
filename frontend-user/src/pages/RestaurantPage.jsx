import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
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
  Tag,
  X,
  LocateFixed,
} from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';
import { fetchRoute, fetchCoordinates } from '../utils/osmHelpers';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../i18n';

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

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-4 max-w-md mx-auto">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
          <X size={28} />
        </div>
        <h2 className="font-bold text-lg text-slate-900 dark:text-white mb-1">
          {t('restaurant.not_found_title')}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {t('restaurant.not_found_desc')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
          <Button onClick={() => navigate('/food')}>{t('restaurant.back_to_food')}</Button>
        </div>
      </div>
    );
  }

  if (!rest) {
    return <div className="p-10 text-center animate-pulse">{t('restaurant.loading')}</div>;
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
        details: `${itemsSummary} — Antar ke: ${deliveryAddress}`,
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

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-28">
      {/* Header Banner Restoran */}
      <div className="relative">
        <Link
          to="/food"
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-md hover:scale-105 transition"
        >
          <ArrowLeft size={18} />
        </Link>
        <Card className="overflow-hidden p-0 border border-slate-200 dark:border-slate-700">
          <div className="h-48 bg-slate-200 relative overflow-hidden">
            <img
              src={rest.image}
              alt={rest.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <span className="text-[11px] font-bold uppercase bg-primary px-2.5 py-1 rounded-full mb-1 inline-block">
                {rest.category}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                {rest.name}
              </h1>
              <p className="text-xs text-slate-200 flex items-center gap-1 mt-1">
                <MapPin size={12} /> {rest.address}
              </p>
            </div>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-bold text-amber-500">
              <Star size={15} fill="currentColor" /> {t('restaurant.reviews_count', { rating: rest.rating })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={15} /> {rest.deliveryTime}
            </span>
            <span className="text-green-600 font-bold">{t('restaurant.open_now')}</span>
          </div>
        </Card>
      </div>

      {/* TAMPILAN 1: DAFTAR MENU MAKANAN */}
      {step === 'menu' && (
        <div className="space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white px-1">
            {t('restaurant.menu_title')}
          </h2>
          {rest.menuItems.map((item) => {
            const inCart = cart.items.find((i) => i.id === item.id);
            const isAvailable = item.is_available ?? true;
            return (
              <Card
                key={item.id}
                className={`p-4 flex gap-4 items-center border border-slate-200 dark:border-slate-700 transition ${isAvailable ? 'hover:shadow-sm' : 'opacity-60'}`}
              >
                {item.image && (
                  <div className="relative shrink-0">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-100"
                    />
                    {!isAvailable && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl text-white text-[10px] font-bold">
                        {t('restaurant.sold_out')}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex-1">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 mb-2">
                    {item.description}
                  </p>
                  <p className="font-extrabold text-sm text-primary">
                    {formatRupiah(item.price)}
                  </p>
                  {!isAvailable && !item.image && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                      {t('restaurant.sold_out')}
                    </span>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {!isAvailable ? null : inCart ? (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                      <button
                        onClick={() => {
                          if (inCart.qty > 1) {
                            updateQty(item.id, inCart.qty - 1);
                          } else {
                            removeItem(item.id);
                          }
                        }}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-sm"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-bold text-xs px-1 text-slate-900 dark:text-white">
                        {inCart.qty}
                      </span>
                      <button
                        onClick={() => addItem({ ...item, qty: 1 })}
                        className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-sm"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="text-xs px-3.5 py-1.5 font-bold"
                      onClick={() => {
                        addItem({ ...item, qty: 1 });
                        toast.success(t('restaurant.added_to_cart', { name: item.name }));
                      }}
                    >
                      + {t('restaurant.add')}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* BAR KERANJANG TERAPUNG DI BAWAH */}
      {cart.items.length > 0 && step === 'menu' && (
        <div className="fixed bottom-16 md:bottom-4 left-4 right-4 max-w-2xl mx-auto z-40">
          <div className="bg-slate-900 dark:bg-slate-800 text-white p-3.5 px-5 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-700 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
                <ShoppingBag size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-300 font-medium">
                  {t('restaurant.items_selected', { count: cart.items.reduce((acc, curr) => acc + curr.qty, 0) })}
                </p>
                <p className="font-extrabold text-base">{formatRupiah(subtotal)}</p>
              </div>
            </div>
            <Button
              className="py-2.5 px-5 font-bold text-xs sm:text-sm shadow-md"
              onClick={() => setStep('checkout')}
            >
              {t('restaurant.to_checkout')} ➔
            </Button>
          </div>
        </div>
      )}

      {/* TAMPILAN 2: HALAMAN CHECKOUT LENGKAP */}
      {step === 'checkout' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-150">
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700 !overflow-visible">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              {t('restaurant.delivery_address')}
            </h3>
            <div className="relative z-10">
              <LocationAutocomplete
                placeholder={t('restaurant.delivery_address_placeholder')}
                icon={MapPin}
                iconColor="text-red-500"
                value={deliveryAddress}
                onChange={setDeliveryAddress}
                onSelect={(loc) => setDeliveryCoords({ lat: loc.lat, lng: loc.lng })}
              />
            </div>
            <div className="flex items-center justify-between -mt-1">
              <SavedAddressPicker
                onSelect={({ address, lat, lng }) => {
                  setDeliveryAddress(address);
                  setDeliveryCoords({ lat, lng });
                }}
              />
              <button
                type="button"
                onClick={handleLocateMe}
                className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark"
              >
                <LocateFixed size={12} /> {t('common.use_current_location')}
              </button>
            </div>
            <div className="h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <WiraMap
                center={deliveryCoords}
                zoom={16}
                markers={[{ ...deliveryCoords, type: 'dropoff', label: t('restaurant.delivery_pin_label') }]}
                onMarkerDragEnd={handleMarkerDrag}
              />
            </div>
            <p className="text-[11px] text-slate-400">{t('common.map_pin_hint')}</p>
          </Card>

          {/* Rincian Pesanan */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              {t('restaurant.order_summary')}
            </h3>
            <div className="space-y-2 divide-y divide-slate-100 dark:divide-slate-700/50">
              {cart.items.map((i) => (
                <div key={i.id} className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {i.qty}x {i.name}
                    </span>
                  </div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatRupiah(i.price * i.qty)}
                  </span>
                </div>
              ))}
            </div>

            {/* Input Promo */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
              {activePromo ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Tag size={12} /> {t('promo.applied', { code: activePromo.code })}
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 font-semibold"
                    onClick={handleRemovePromo}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('promo.placeholder')}
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white uppercase font-bold"
                  />
                  <Button size="sm" variant="outline" onClick={handleCheckPromo} disabled={checkingPromo || !promoCode.trim()}>
                    {checkingPromo ? t('promo.checking') : t('promo.apply')}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="text-[11px] text-red-500 font-semibold">{promoError}</p>
              )}
            </div>

            {/* Hitung Rincian */}
            <div className="pt-2 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>{t('restaurant.subtotal')}</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>{t('restaurant.delivery_fee')}</span>
                <span>{formatRupiah(dynamicDeliveryFee)}</span>
              </div>
              {distance > 0 && (
                <div className="flex justify-between text-[10px] text-slate-400 -mt-1">
                  <span>{t('restaurant.delivery_distance')}</span>
                  <span>{distance.toFixed(1)} km</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-600 font-bold">
                  <span>{t('restaurant.discount')}</span>
                  <span>-{formatRupiah(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>{t('restaurant.grand_total')}</span>
                <span className="text-primary">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </Card>

          {/* Metode Pembayaran */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {t('restaurant.choose_payment')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('WiraPay')}
                className={`p-3 rounded-xl border text-left transition ${
                  paymentMethod === 'WiraPay'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className="font-bold text-xs text-slate-900 dark:text-white">WiraPay</p>
                <p className="text-[10px] text-slate-500">{t('common.balance_with_amount', { amount: formatRupiah(balance) })}</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Tunai')}
                className={`p-3 rounded-xl border text-left transition ${
                  paymentMethod === 'Tunai'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className="font-bold text-xs text-slate-900 dark:text-white">{t('common.pay_cash_cod')}</p>
                <p className="text-[10px] text-slate-500">{t('common.pay_cash_to_courier')}</p>
              </button>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep('menu')}
            >
              {t('common.back')}
            </Button>
            <Button
              className="flex-1 font-bold"
              onClick={handleConfirmOrder}
              disabled={loading}
            >
              {loading ? t('common.processing') : t('restaurant.place_order', { price: formatRupiah(grandTotal) })}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
