import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import SavedAddressPicker from '../components/common/SavedAddressPicker';
import {
  MapPin,
  Navigation,
  ArrowRight,
  LocateFixed,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import API_BASE_URL from '../config/api';

export default function RidePage() {
  const navigate = useNavigate();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [step, setStep] = useState('input'); // input, vehicle - post-booking UI lives on ActiveOrderPage
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('WiraPay'); // 'WiraPay' or 'Tunai'

  const [vehicles, setVehicles] = useState([]);
  
  useEffect(() => {
    const fetchVehicles = async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('service_type', 'ride')
        .eq('is_active', true)
        .order('price', { ascending: true });
        
      if (data) {
        setVehicles(data.map(v => ({
          id: v.type,
          name: v.name,
          basePrice: v.price, // Store original for calculation
          price: v.price,
          perKmRate: v.per_km_rate,
          time: v.duration,
          icon: v.type === 'motor' ? '🛵' : (v.type === 'mobil' ? '🚗' : '🚙'),
          desc: `Kapasitas: ${v.capacity} orang`
        })));
      }
    };
    fetchVehicles();
  }, []);

  const [mapState, setMapState] = useState({
    center: { lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng },
    zoom: 14,
    markers: [{ lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng }],
    route: null
  });
  const [isSearching, setIsSearching] = useState(false);

  const [routeInfo, setRouteInfo] = useState(null);

  const handleLocateMe = (idx = 0) => {
    if (!navigator.geolocation) {
      toast.error('Browser Anda tidak mendukung fitur lokasi');
      return;
    }
    
    const toastId = toast.loading('Mencari lokasi Anda...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        
        // Update map
        setMapState(prev => {
          const newMarkers = [...prev.markers];
          if (idx === 1 && newMarkers.length < 2) newMarkers.push(latLng);
          else newMarkers[idx] = latLng;
          return { ...prev, center: latLng, zoom: 19, markers: newMarkers };
        });

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
          const data = await res.json();
          if (data && data.display_name) {
            const name = data.display_name.split(',')[0];
            if (idx === 0) setPickup(name);
            else setDropoff(name);
          }
        } catch (e) {
          console.error(e);
        }
        
        toast.success('Lokasi ditemukan!', { id: toastId });
      },
      (error) => {
        console.error("GPS Error:", error);
        let errorMsg = 'Gagal mendapatkan lokasi.';
        if (error.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
        else if (error.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
        else if (error.code === 3) errorMsg = 'Pencarian lokasi timeout. Sinyal GPS lemah.';
        toast.error(errorMsg, { id: toastId, duration: 6000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // Otomatis mencari rute jika marker 0 dan 1 sudah ada (pickup & dropoff valid)
  useEffect(() => {
    if (mapState.markers.length === 2 && pickup && dropoff && step === 'input') {
      const getRoute = async () => {
        setIsSearching(true);
        const { fetchRoute } = await import('../utils/osmHelpers');
        const routeData = await fetchRoute(mapState.markers[0], mapState.markers[1]);
        if (routeData) {
          setMapState(prev => ({ ...prev, route: routeData.coordinates, zoom: 14 }));
          setRouteInfo({
            distance: routeData.distance, // in meters
            duration: routeData.duration  // in seconds
          });
        }
        setIsSearching(false);
      };
      getRoute();
    }
  }, [mapState.markers, pickup, dropoff, step]);

  const defaultVehicles = [
    { id: 'motor', name: 'WiraRide Motor', basePrice: 12000, price: 12000, icon: '🛵', desc: 'Kapasitas: 1 orang' },
    { id: 'mobil', name: 'WiraRide Mobil', basePrice: 25000, price: 25000, icon: '🚗', desc: 'Kapasitas: 4 orang' }
  ];

  const sourceVehicles = vehicles.length > 0 ? vehicles : defaultVehicles;

  const dynamicVehicles = sourceVehicles.map(v => {
    if (!routeInfo) return v;
    const distKm = routeInfo.distance / 1000;
    const extraKm = Math.max(0, distKm - 2);
    const perKmRate = v.perKmRate || (v.id === 'motor' ? 3000 : 5000);
    const dynamicPrice = (v.basePrice || v.price || 15000) + Math.ceil(extraKm * perKmRate);
    const estMins = Math.ceil(routeInfo.duration / 60);
    return { ...v, price: dynamicPrice, time: `~${estMins} mnt` };
  });

  const handleLanjut = () => {
    if (!pickup || !dropoff) {
      toast.error('Mohon isi titik jemput dan tujuan Anda');
      return;
    }
    if (dynamicVehicles.length > 0) {
      setSelectedVehicle(dynamicVehicles[0]);
    }
    setStep('vehicle');
  };

  // Promo/kupon state for the vehicle-selection step. These were previously
  // referenced (handleCheckPromo, calculateFinalPrice) without ever being
  // declared, which crashed every render of the 'vehicle' step in
  // production (calculateFinalPrice() is called unconditionally on line
  // ~600's "Pesan Sekarang" button).
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

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
      if (data.service_type && data.service_type !== 'ride') throw new Error('Promo tidak berlaku untuk layanan ini');
      
      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  
  const calculateFinalPrice = () => {
    const basePrice = selectedVehicle?.price || 15000;
    if (!activePromo) return basePrice;
    
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    } else {
      return Math.max(0, basePrice - activePromo.discount);
    }
  };

  const handleStartBooking = async () => {
    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error('Saldo WiraPay tidak cukup, silakan gunakan Tunai atau Top Up dulu');
      return;
    }

    try {
      const pickupLat = mapState.markers[0]?.lat;
      const pickupLng = mapState.markers[0]?.lng;
      const dropoffLat = mapState.markers[1]?.lat;
      const dropoffLng = mapState.markers[1]?.lng;

      // Cek ketersediaan driter terdekat secara real (PostGIS nearest-neighbor),
      // hanya untuk memberi info jujur ke pelanggan - tidak memblokir pemesanan,
      // karena driver baru bisa online kapan saja setelah ini.
      // `nearbyDrivers` is kept (not just the count) so the push-notification
      // fan-out below can reuse this exact same lookup as its target list -
      // no second nearest-driver query.
      let driverCount = null;
      let nearbyDrivers = [];
      if (pickupLat != null && pickupLng != null) {
        const { data: nearby } = await supabase.rpc('get_nearest_drivers', {
          user_lat: pickupLat,
          user_lng: pickupLng,
          target_vehicle_type: selectedVehicle?.id || null,
          only_online: true,
          max_results: 5
        });
        driverCount = nearby?.length || 0;
        nearbyDrivers = nearby || [];
      }

      const orderDetails = JSON.stringify({
        pickup: { name: pickup, lat: pickupLat, lng: pickupLng },
        dropoff: { name: dropoff, lat: mapState.markers[1]?.lat, lng: mapState.markers[1]?.lng },
        route: mapState.route
      });

      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraRide ke ${dropoff}`,
        serviceType: 'ride',
        title: `Perjalanan ke ${dropoff}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        details: orderDetails,
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        // Structured pricing inputs for the server-side trigger
        // (migrations/0059): rateCode must equal vehicles.type - the
        // vehicles fetch above maps `id: v.type`, so selectedVehicle.id IS
        // vehicles.type (e.g. 'motor'/'mobil'), not a UI label.
        rateCode: selectedVehicle?.id || null,
        distanceMeters: routeInfo?.distance ?? null,
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

      // Dispatch is handled in ActiveOrderPage

      if (driverCount === 0) {
        toast.error('Saat ini belum ada driver WiraRide terdekat yang online, tapi pesanan Anda tetap kami carikan.', { duration: 6000 });
      } else {
        toast.success('Mencari driver di sekitar Anda...');
      }
    } catch (err) {
      toast.error(`Gagal: ${err.message}`);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Area Peta Interaktif */}
      <div className="absolute inset-0 z-0 bg-slate-200">
        <WiraMap 
          center={mapState.center} 
          zoom={mapState.zoom} 
          markers={mapState.markers}
          route={mapState.route}
          onMarkerDragEnd={async (idx, latLng) => {
            setMapState(prev => {
              const newMarkers = [...prev.markers];
              // Ensure we have two markers if we are dragging the second one
              if (idx === 1 && newMarkers.length < 2) {
                newMarkers[1] = latLng;
              } else {
                newMarkers[idx] = latLng;
              }
              // Center on the moved marker
              return { ...prev, center: latLng, markers: newMarkers };
            });

            // Reverse geocode
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
              const data = await res.json();
              if (data && data.display_name) {
                const shortName = data.display_name.split(',')[0];
                if (idx === 0) setPickup(shortName);
                if (idx === 1) setDropoff(shortName);
              }
            } catch (e) {
              console.error(e);
            }
          }}
        />

        {/* Input Terapung jika langkah awal */}
        {step === 'input' && (
          <div className="absolute top-3 left-3 right-3 md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-6 md:w-[28rem] z-[400] max-w-md mx-auto md:mx-0">
            <Card className="p-3.5 space-y-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200 dark:border-slate-700 !overflow-visible">
              <LocationAutocomplete
                placeholder="Lokasi Penjemputan Anda (cth: Ampenan / Rumah)"
                icon={Navigation}
                iconColor="text-blue-500"
                value={pickup}
                onChange={setPickup}
                onSelect={(loc) => {
                  setMapState(prev => {
                    const newMarkers = [...prev.markers];
                    newMarkers[0] = { lat: loc.lat, lng: loc.lng };
                    return { ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19, markers: newMarkers };
                  });
                }}
              />
              <div className="flex items-center justify-between pr-1 mt-[-4px] mb-2">
                <SavedAddressPicker
                  onSelect={({ address, lat, lng }) => {
                    setPickup(address);
                    setMapState(prev => {
                      const newMarkers = [...prev.markers];
                      newMarkers[0] = { lat, lng };
                      return { ...prev, center: { lat, lng }, zoom: 19, markers: newMarkers };
                    });
                  }}
                />
                <button
                  onClick={() => handleLocateMe(0)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark"
                >
                  <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
                </button>
              </div>

              <LocationAutocomplete
                placeholder="Mau ke mana? (cth: Epicentrum Mall / Senggigi)"
                icon={MapPin}
                iconColor="text-red-500"
                value={dropoff}
                onChange={setDropoff}
                onSelect={(loc) => {
                  setMapState(prev => {
                    const newMarkers = [...prev.markers];
                    newMarkers[1] = { lat: loc.lat, lng: loc.lng };
                    return { ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19, markers: newMarkers };
                  });
                }}
              />
              <div className="flex items-center justify-between pr-1 mt-[-4px]">
                <SavedAddressPicker
                  onSelect={({ address, lat, lng }) => {
                    setDropoff(address);
                    setMapState(prev => {
                      const newMarkers = [...prev.markers];
                      newMarkers[1] = { lat, lng };
                      return { ...prev, center: { lat, lng }, zoom: 19, markers: newMarkers };
                    });
                  }}
                />
                <button
                  onClick={() => handleLocateMe(1)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:text-red-600"
                >
                  <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Bagian Bawah: Aksi & Langkah Pemesanan */}
      <div className="absolute bottom-0 w-full md:w-[28rem] md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:rounded-3xl z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t md:border border-white/20 dark:border-slate-700/50 flex flex-col max-h-[75vh]">
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto my-3 shrink-0"></div>
        <div className="flex-1 overflow-y-auto pb-6">
        {/* LANGKAH 1: PILIH TUJUAN CEPAT */}
        {step === 'input' && (
          <div className="p-5 space-y-3">
            {routeInfo && (
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Navigation size={14} className="text-primary" /> Jarak Tempuh
                </span>
                <span className="text-sm font-bold text-slate-800 dark:text-white">
                  {(routeInfo.distance / 1000).toFixed(1)} km
                </span>
              </div>
            )}
            <Button
              className="w-full py-3 font-bold text-sm shadow-md"
              onClick={handleLanjut}
              disabled={!pickup || !dropoff || isSearching || !routeInfo}
            >
              {isSearching ? 'Menghitung Rute...' : 'Lanjut Pilih Kendaraan'} <ArrowRight size={16} className="ml-1 inline" />
            </Button>
          </div>
        )}

        {/* LANGKAH 2: PILIH KENDARAAN & METODE BAYAR */}
        {step === 'vehicle' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Pilih Kendaraan
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-xs">
                  {pickup} ➔ {dropoff}
                </p>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full text-slate-600 dark:text-slate-300 font-medium">
                Jarak {routeInfo ? `± ${(routeInfo.distance / 1000).toFixed(1)} km` : ''}
              </span>
            </div>

            <div className="space-y-2">
              {dynamicVehicles.map((v) => {
                const isSelected = selectedVehicle?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVehicle(v)}
                    className={`flex items-center justify-between p-3 rounded-2xl border-2 cursor-pointer transition ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{v.icon}</span>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {v.name}
                        </h4>
                        <p className="text-[11px] text-slate-500">{v.desc}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {formatRupiah(v.price)}
                      </span>
                      <p className="text-[10px] text-slate-400">{v.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kode Promo */}
            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl space-y-2">
              {activePromo ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-green-600 dark:text-green-400">
                    Promo "{activePromo.code}" diterapkan
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 font-semibold"
                    onClick={() => {
                      setActivePromo(null);
                      setPromoCode('');
                      setPromoError('');
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Kode Promo (opsional)"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white uppercase font-bold"
                  />
                  <Button
                    variant="outline"
                    className="text-xs px-3"
                    onClick={handleCheckPromo}
                    disabled={checkingPromo || !promoCode.trim()}
                  >
                    {checkingPromo ? '...' : 'Pakai'}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="text-[11px] text-red-500 font-semibold">{promoError}</p>
              )}
            </div>

            {/* Metode Pembayaran */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Metode Pembayaran:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('WiraPay')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    paymentMethod === 'WiraPay'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  WiraPay ({formatRupiah(balance)})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Tunai')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    paymentMethod === 'Tunai'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Tunai (COD)
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setStep('input')}
              >
                Ganti Rute
              </Button>
              <Button
                className="flex-1 font-bold text-xs sm:text-sm"
                onClick={handleStartBooking}
              >
                Pesan Sekarang • {formatRupiah(calculateFinalPrice())}
              </Button>
            </div>
          </div>
        )}

      </div>

      </div>
    </div>
  );
}
