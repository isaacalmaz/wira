import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
          price: v.price,
          time: v.duration,
          icon: v.type === 'motor' ? '🛵' : (v.type === 'mobil' ? '🚗' : '🚙'),
          desc: `Kapasitas: ${v.capacity} orang`
        })));
      }
    };
    fetchVehicles();
  }, []);

  // Simulasi Driver yang ditugaskan
  const assignedDriver = {
    name: 'Ahmad Supardi',
    phone: '0812-3456-7890',
    vehicle: selectedVehicle?.id === 'bike' ? 'Honda Vario 160 (Hitam)' : 'Toyota Avanza (Silver)',
    plate: 'DR 1234 AB',
    rating: 4.9,
    trips: 428,
  };

  const handleSearch = () => {
    if (!pickup || !dropoff) {
      toast.error('Mohon isi titik jemput dan tujuan Anda');
      return;
    }
    setSelectedVehicle(vehicles[0]);
    setStep('vehicle');
  };

  const handleStartBooking = () => {
    if (paymentMethod === 'WiraPay' && balance < selectedVehicle.price) {
      toast.error('Saldo WiraPay tidak cukup, silakan gunakan Tunai atau Top Up dulu');
      return;
    }
    setStep('searching');
  };

  // Efek simulasi pencarian & penugasan driver
  useEffect(() => {
    if (step === 'searching') {
      const timer = setTimeout(() => {
        setStep('tracking');
        setTripStage(0);
        toast.success(`Driver Ditemukan: ${assignedDriver.name}!`, { icon: '🛵', duration: 4000 });
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Efek simulasi tahapan perjalanan
  useEffect(() => {
    if (step === 'tracking') {
      if (tripStage === 0) {
        const t1 = setTimeout(() => setTripStage(1), 4000);
        return () => clearTimeout(t1);
      } else if (tripStage === 1) {
        const t2 = setTimeout(() => setTripStage(2), 4000);
        return () => clearTimeout(t2);
      }
    }
  }, [step, tripStage]);

  // Selesaikan perjalanan
  const handleFinishTrip = async () => {
    try {
      if (paymentMethod === 'WiraPay') {
        await pay(selectedVehicle.price, `WiraRide ke ${dropoff}`);
      }

      await addOrder({
        service: 'WiraRide',
        serviceType: 'ride',
        title: `Perjalanan ke ${dropoff}`,
        details: `${selectedVehicle.name} • ${assignedDriver.plate} (${assignedDriver.name})`,
        price: selectedVehicle.price,
        status: 'Selesai',
        paymentMethod: paymentMethod,
      });

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
        <MapContainer
          center={[APP_CONFIG.defaultLocation.lat, APP_CONFIG.defaultLocation.lng]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[APP_CONFIG.defaultLocation.lat, APP_CONFIG.defaultLocation.lng]}>
            <Popup>Lokasi Anda (Mataram)</Popup>
          </Marker>
        </MapContainer>

        {/* Input Terapung jika langkah awal */}
        {step === 'input' && (
          <div className="absolute top-3 left-3 right-3 z-[400] max-w-md mx-auto">
            <Card className="p-3.5 space-y-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-6 flex justify-center text-green-500">
                  <Navigation size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Lokasi Penjemputan Anda (cth: Ampenan / Rumah)"
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border-0 rounded-xl p-2 text-xs sm:text-sm focus:ring-2 focus:ring-primary dark:text-white"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 flex justify-center text-red-500">
                  <MapPin size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Mau ke mana? (cth: Epicentrum Mall / Senggigi)"
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border-0 rounded-xl p-2 text-xs sm:text-sm focus:ring-2 focus:ring-primary dark:text-white"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                />
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Bagian Bawah: Aksi & Langkah Pemesanan */}
      <div className="shrink-0 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
        {/* LANGKAH 1: PILIH TUJUAN CEPAT */}
        {step === 'input' && (
          <div className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-800 dark:text-white">
              Tujuan Populer di Mataram & Lombok:
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {[
                { name: 'Epicentrum Mall', pickupLoc: 'Pusat Kota Mataram' },
                { name: 'Pantai Senggigi', pickupLoc: 'Mataram' },
                { name: 'Bandara Internasional Lombok (BIL)', pickupLoc: 'Kota Mataram' },
                { name: 'Pelabuhan Lembar', pickupLoc: 'Cakranegara' },
              ].map((loc) => (
                <button
                  key={loc.name}
                  onClick={() => {
                    setPickup(loc.pickupLoc);
                    setDropoff(loc.name);
                  }}
                  className="whitespace-nowrap px-3.5 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-semibold hover:bg-primary/10 hover:text-primary dark:text-white transition"
                >
                  📍 {loc.name}
                </button>
              ))}
            </div>
            <Button
              className="w-full py-3 font-bold text-sm shadow-md"
              onClick={handleSearch}
              disabled={!pickup || !dropoff}
            >
              Lanjut Pilih Kendaraan <ArrowRight size={16} className="ml-1 inline" />
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
                Jarak ± 4.2 km
              </span>
            </div>

            <div className="space-y-2">
              {vehicles.map((v) => {
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
                    {assignedDriver.name}
                    <span className="text-[10px] text-amber-500 flex items-center font-bold">
                      ⭐ {assignedDriver.rating}
                    </span>
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {assignedDriver.plate}
                  </p>
                  <p className="text-[11px] text-slate-500">{assignedDriver.vehicle}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`tel:${assignedDriver.phone}`}
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
              onClick={handleFinishTrip}
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
                  {assignedDriver.name} ({assignedDriver.plate})
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
