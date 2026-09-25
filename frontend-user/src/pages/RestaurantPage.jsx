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

export default function RestaurantPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
          Restoran Tidak Ditemukan
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Restoran ini mungkin sudah tidak tersedia, atau terjadi gangguan jaringan. Silakan coba lagi.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>Coba Lagi</Button>
          <Button onClick={() => navigate('/food')}>Kembali ke WiraFood</Button>
        </div>
      </div>
    );
  }

  if (!rest) {
    return <div className="p-10 text-center animate-pulse">Memuat data restoran...</div>;
  }

  const grandTotal = Math.max(0, subtotal + dynamicDeliveryFee - discount);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Browser Anda tidak mendukung fitur lokasi');
      return;
    }
    const toastId = toast.loading('Mencari lokasi Anda...');
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
        toast.success('Lokasi ditemukan!', { id: toastId });
      },
      (error) => {
        console.error('GPS Error:', error);
        let errorMsg = 'Gagal mendapatkan lokasi.';
        if (error.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
        else if (error.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
        else if (error.code === 3) errorMsg = 'Pencarian lokasi timeout.';
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

      if (error || !data) throw new Error('Kode promo tidak ditemukan');
      if (data.status !== 'Active') throw new Error('Promo sudah tidak aktif');
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error('Promo sudah kadaluarsa');
      if (data.service_type && data.service_type !== 'food') throw new Error('Promo tidak berlaku untuk restoran');

      setActivePromo(data);
      const promoDiscount = data.type === 'Percentage'
        ? Math.round((subtotal * Number(data.discount)) / 100)
        : Number(data.discount) || 0;
      setDiscount(Math.max(0, Math.min(promoDiscount, subtotal)));
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
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
      toast.error('Keranjang Anda masih kosong');
      return;
    }
    // RestaurantPage is already mounted under Layout, which redirects any
    // unauthenticated visitor to /login before this page can even render -
    // so this is defense-in-depth (e.g. a session expiring mid-checkout
    // without a reload) rather than the primary guard. Without it, a
    // session-less request would fall through to ecosystemService.js's
    // guest-fallback insert, which drops merchant_id/dropoff coordinates/
    // delivery_fee entirely and produces an order no merchant or driver can
    // ever see or act on.
    if (!user) {
      toast.error('Silakan login terlebih dahulu untuk memesan makanan');
      navigate('/login');
      return;
    }
    if (paymentMethod === 'WiraPay' && balance < grandTotal) {
      toast.error('Saldo WiraPay Anda tidak mencukupi untuk pembayaran ini');
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

      // Only count the promo as "used" once it's actually attached to a
      // real, created order - not just when the code was validated - so a
      // promo can't be reserved by someone who never completes checkout.
      if (activePromo?.id) {
        supabase.rpc('increment_promo_usage', { promo_id: activePromo.id }).then(({ error: usageErr }) => {
          if (usageErr) console.error('Gagal mencatat pemakaian promo:', usageErr);
        });
      }

      navigate(`/active-order/${order.id}`);
      clearCart();
      handleRemovePromo(); // don't let a used promo silently discount the next order
      toast.success('Menunggu konfirmasi dari restoran...');
    } catch (err) {
      toast.error(err.message || 'Pemesanan gagal');
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
              <Star size={15} fill="currentColor" /> {rest.rating} (500+ Ulasan)
            </span>
            <span className="flex items-center gap-1">
              <Clock size={15} /> {rest.deliveryTime}
            </span>
            <span className="text-green-600 font-bold">Buka Sekarang</span>
          </div>
        </Card>
      </div>

      {/* TAMPILAN 1: DAFTAR MENU MAKANAN */}
      {step === 'menu' && (
        <div className="space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white px-1">
            Menu Makanan & Minuman
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
                        Habis
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
                      Habis
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
                        toast.success(`${item.name} ditambahkan ke keranjang`);
                      }}
                    >
                      + Tambah
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
                  {cart.items.reduce((acc, curr) => acc + curr.qty, 0)} Item Dipilih
                </p>
                <p className="font-extrabold text-base">{formatRupiah(subtotal)}</p>
              </div>
            </div>
            <Button
              className="py-2.5 px-5 font-bold text-xs sm:text-sm shadow-md"
              onClick={() => setStep('checkout')}
            >
              Lanjut Checkout ➔
            </Button>
          </div>
        </div>
      )}

      {/* TAMPILAN 2: HALAMAN CHECKOUT LENGKAP */}
      {step === 'checkout' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-150">
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700 !overflow-visible">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Alamat Pengantaran
            </h3>
            <div className="relative z-10">
              <LocationAutocomplete
                placeholder="Cari alamat pengantaran..."
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
                <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
              </button>
            </div>
            <div className="h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <WiraMap
                center={deliveryCoords}
                zoom={16}
                markers={[{ ...deliveryCoords, type: 'dropoff', label: 'Alamat Pengantaran' }]}
                onMarkerDragEnd={handleMarkerDrag}
              />
            </div>
            <p className="text-[11px] text-slate-400">Geser pin di peta untuk menyesuaikan titik pengantaran yang tepat.</p>
          </Card>

          {/* Rincian Pesanan */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Ringkasan Pesanan
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
                    <Tag size={12} /> Promo "{activePromo.code}" diterapkan
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 font-semibold"
                    onClick={handleRemovePromo}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Kode Promo: WIRALOMBOK"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white uppercase font-bold"
                  />
                  <Button size="sm" variant="outline" onClick={handleCheckPromo} disabled={checkingPromo || !promoCode.trim()}>
                    {checkingPromo ? '...' : 'Pakai'}
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
                <span>Subtotal Makanan:</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Ongkos Kirim:</span>
                <span>{formatRupiah(dynamicDeliveryFee)}</span>
              </div>
              {distance > 0 && (
                <div className="flex justify-between text-[10px] text-slate-400 -mt-1">
                  <span>Jarak Pengantaran:</span>
                  <span>{distance.toFixed(1)} km</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-green-600 font-bold">
                  <span>Diskon Promo:</span>
                  <span>-{formatRupiah(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>Total Pembayaran:</span>
                <span className="text-primary">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </Card>

          {/* Metode Pembayaran */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Pilih Metode Bayar
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
                <p className="text-[10px] text-slate-500">Saldo: {formatRupiah(balance)}</p>
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
                <p className="font-bold text-xs text-slate-900 dark:text-white">Tunai (COD)</p>
                <p className="text-[10px] text-slate-500">Bayar ke kurir</p>
              </button>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep('menu')}
            >
              Kembali
            </Button>
            <Button
              className="flex-1 font-bold"
              onClick={handleConfirmOrder}
              disabled={loading}
            >
              {loading ? 'Memproses...' : `Pesan Sekarang • ${formatRupiah(grandTotal)}`}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
