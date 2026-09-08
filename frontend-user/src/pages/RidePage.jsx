import { useState, useEffect } from 'react';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import {
  MapPin,
  Navigation,
  Car,
  Shield,
  Phone,
  MessageSquare,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
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

export default function RidePage() {
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [step, setStep] = useState('input'); // input, vehicle, searching, tracking, completed
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('WiraPay'); // 'WiraPay' or 'Tunai'
  const [rating, setRating] = useState(5);

  // Status perjalanan aktif
  const [tripStage, setTripStage] = useState(0); 
  // 0: Driver menuju lokasi (3 menit)
  // 1: Driver tiba di penjemputan
  // 2: Dalam perjalanan menuju tujuan
  // 3: Selesai perjalanan

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
          time: v.duration,
          icon: v.type === 'motor' ? '🛵' : (v.type === 'mobil' ? '🚗' : '🚙'),
          desc: `Kapasitas: ${v.capacity} orang`
        })));
      }
    };
    fetchVehicles();
  }, []);

  // Data Driver riil yang menerima pesanan
  const [driverInfo, setDriverInfo] = useState(null);

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
        console.error(error);
        toast.error('Gagal mendapatkan lokasi. Pastikan izin lokasi aktif.', { id: toastId });
      },
      { enableHighAccuracy: true }
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

  const dynamicVehicles = vehicles.map(v => {
    if (!routeInfo) return v;
    const distKm = routeInfo.distance / 1000;
    const extraKm = Math.max(0, distKm - 2);
    const perKmRate = v.id === 'motor' ? 3000 : 5000;
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

  const [activeOrderId, setActiveOrderId] = useState(null);

  const handleStartBooking = async () => {
    if (paymentMethod === 'WiraPay' && balance < selectedVehicle.price) {
      toast.error('Saldo WiraPay tidak cukup, silakan gunakan Tunai atau Top Up dulu');
      return;
    }

    try {
      const order = await addOrder({
        serviceType: 'ride',
        title: `Perjalanan ke ${dropoff}`,
        price: selectedVehicle.price,
        paymentMethod: paymentMethod,
      });
      setActiveOrderId(order.id);
      setStep('searching');
      toast.success('Mencari driver di sekitar Anda...');
    } catch (err) {
      toast.error(`Gagal: ${err.message}`);
    }
  };

  // Efek Real-time untuk mendengarkan perubahan status dari Admin / Driver
  useEffect(() => {
    if (!activeOrderId) return;

    const channel = supabase
      .channel(`order_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrderId}` },
        async (payload) => {
          const newStatus = payload.new.status;
          
          if (newStatus === 'accepted') {
            // Ambil data asli Driver dari database
            if (payload.new.driver_id) {
              const { data: driverUser } = await supabase.from('users').select('*').eq('id', payload.new.driver_id).maybeSingle();
              const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
              let regInfo = null;
              if (flagsData && Array.isArray(flagsData.features)) {
                regInfo = flagsData.features.find(f => f.auth_id === payload.new.driver_id || f.email === driverUser?.email);
              }
              setDriverInfo({
                name: driverUser?.name || 'Mitra Driver Wira',
                phone: driverUser?.phone || '-',
                vehicle: regInfo?.vehicle || 'Sepeda Motor Wira',
                plate: regInfo?.plate || 'DR WIRA',
                rating: 5.0,
              });
            }

            setStep('tracking');
            setTripStage(0);
            toast.success(`Driver Ditemukan!`, { icon: '🛵', duration: 4000 });
          } 
          else if (newStatus === 'completed') {
            handleCompleteTrip();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  // Simulasi Tahapan Perjalanan jika sudah accepted (bisa dikontrol realtime juga nanti, untuk sekarang kita simulasikan)
  useEffect(() => {
    if (step === 'tracking') {
      if (tripStage === 0) {
        const t1 = setTimeout(() => setTripStage(1), 5000);
        return () => clearTimeout(t1);
      } else if (tripStage === 1) {
        const t2 = setTimeout(() => setTripStage(2), 5000);
        return () => clearTimeout(t2);
      }
    }
  }, [step, tripStage]);

  const handleCompleteTrip = async () => {
    try {
      if (paymentMethod === 'WiraPay') {
        await pay(selectedVehicle.price, `WiraRide ke ${dropoff}`);
      }
      setStep('completed');
      toast.success('Perjalanan Anda telah selesai!');
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan pembayaran');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] max-w-4xl mx-auto">
      {/* Area Peta Interaktif */}
      <div className="flex-1 bg-slate-200 relative rounded-2xl overflow-hidden mb-3 shadow-inner min-h-[220px]">
        <WiraMap 
          center={mapState.center} 
          zoom={14} 
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
          <div className="absolute top-3 left-3 right-3 z-[400] max-w-md mx-auto">
            <Card className="p-3.5 space-y-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200 dark:border-slate-700">
              <LocationAutocomplete
                placeholder="Lokasi Penjemputan Anda (cth: Ampenan / Rumah)"
                icon={Navigation}
                iconColor="text-blue-500"
                value={pickup}
                onChange={setPickup}
                onSelect={(loc) => {
                  setMapState(prev => ({ ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19 }));
                }}
              />
              <button
                onClick={() => handleLocateMe(0)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark w-full justify-end pr-1 mt-[-4px] mb-2"
              >
                <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
              </button>
              
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
              <button
                onClick={() => handleLocateMe(1)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:text-red-600 w-full justify-end pr-1 mt-[-4px]"
              >
                <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
              </button>
            </Card>
          </div>
        )}
      </div>

      {/* Bagian Bawah: Aksi & Langkah Pemesanan */}
      <div className="shrink-0 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
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
                Pesan Sekarang • {formatRupiah(selectedVehicle?.price || 15000)}
              </Button>
            </div>
          </div>
        )}

        {/* LANGKAH 3: MENCARI DRIVER */}
        {step === 'searching' && (
          <div className="p-8 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl">
                {selectedVehicle?.icon || '🛵'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Mencarikan Driver Terdekat...
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Sistem Wira sedang menghubungkan pesanan Anda dengan mitra driver di sekitar Mataram.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => setStep('vehicle')}
            >
              Batalkan Pencarian
            </Button>
          </div>
        )}

        {/* LANGKAH 4: DRIVER DITEMUKAN & LIVE TRACKING */}
        {step === 'tracking' && (
          <div className="p-5 space-y-4">
            {/* Status Perjalanan */}
            <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-2xl flex items-center justify-between border border-primary/20">
              <div className="flex items-center gap-2.5">
                <span className="animate-pulse w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-xs sm:text-sm font-bold text-primary dark:text-primary-light">
                  {tripStage === 0 && 'Driver Sedang Menuju Titik Jemput (3 min)'}
                  {tripStage === 1 && 'Driver Telah Sampai di Titik Jemput!'}
                  {tripStage === 2 && 'Dalam Perjalanan Menuju Tujuan'}
                </span>
              </div>
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                {paymentMethod}
              </span>
            </div>

            {/* Kartu Profil Driver */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-lg shadow-sm">
                  👨‍✈️
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1">
                    {driverInfo?.name || 'Mitra Driver Wira'}
                    <span className="text-[10px] text-amber-500 flex items-center font-bold">
                      ⭐ {driverInfo?.rating || '5.0'}
                    </span>
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {driverInfo?.plate || 'DR WIRA'}
                  </p>
                  <p className="text-[11px] text-slate-500">{driverInfo?.vehicle || 'Sepeda Motor'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`tel:${driverInfo?.phone || ''}`}
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-full text-green-600 shadow-sm border border-slate-200 dark:border-slate-700 hover:scale-105 transition"
                  title="Telepon Driver"
                >
                  <Phone size={16} />
                </a>
                <button
                  onClick={() => toast.success('Membuka obrolan chat dengan driver...')}
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-full text-primary shadow-sm border border-slate-200 dark:border-slate-700 hover:scale-105 transition"
                  title="Kirim Pesan"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>

            {/* Tombol Selesaikan Perjalanan (Untuk Uji Coba) */}
            <Button
              className="w-full py-3 font-bold bg-green-600 hover:bg-green-700 text-white shadow-md"
              onClick={handleCompleteTrip}
            >
              Simulasikan Tiba di Tujuan (Selesaikan)
            </Button>
          </div>
        )}

        {/* LANGKAH 5: SELESAI PERJALANAN & RATING */}
        {step === 'completed' && (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 text-green-600 rounded-full mx-auto flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Perjalanan Selesai!
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Terima kasih telah bepergian dengan Wira
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl text-left text-xs space-y-2 border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-400">Rute:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {pickup} ➔ {dropoff}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Driver:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {driverInfo?.name || 'Driver Wira'} ({driverInfo?.plate || 'DR WIRA'})
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                <span className="text-slate-500 font-bold">Total Tarif:</span>
                <span className="font-extrabold text-sm text-primary">
                  {formatRupiah(selectedVehicle?.price || 15000)} ({paymentMethod})
                </span>
              </div>
            </div>

            {/* Beri Bintang Rating Driver */}
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Beri Nilai Driver:
              </p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 transition hover:scale-125"
                  >
                    <Star
                      size={24}
                      className={
                        star <= rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }
                    />
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full py-3 font-bold"
              onClick={() => {
                setStep('input');
                setPickup('');
                setDropoff('');
                toast.success('Terima kasih atas penilaian Anda!');
              }}
            >
              Kembali ke Beranda
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
