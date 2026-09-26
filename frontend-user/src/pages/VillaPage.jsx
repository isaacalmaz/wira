import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Star, MapPin, X, ShieldCheck } from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import API_BASE_URL from '../config/api';

export default function VillaPage() {
  const navigate = useNavigate();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [villas, setVillas] = useState([]);
  const [, setFetchLoading] = useState(true);
  const [area, setArea] = useState('Semua');
  const areas = ['Semua', 'Senggigi', 'Kuta', 'Sembalun', 'Tetebatu'];

  useEffect(() => {
    const fetchVillas = async () => {
      setFetchLoading(true);
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('service_type', 'villa')
        .order('created_at', { ascending: false });
      
      if (data) {
        setVillas(data.map(v => ({
          id: v.id,
          ownerId: v.owner_id,
          name: v.name,
          area: v.address || 'Lombok',
          rating: v.rating || 5.0,
          pricePerNight: v.price_per_night || 750000,
          image: v.image || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600',
          desc: v.description || 'Villa eksklusif di Pulau Lombok dengan pemandangan asri.',
          bedrooms: v.bedrooms || 2,
          amenities: v.amenities || ['WiFi Cepat', 'Kolam Renang', 'Sarapan Gratis']
        })));
      }
      setFetchLoading(false);
    };
    fetchVillas();
  }, []);

  // Modal State
  const [selectedVilla, setSelectedVilla] = useState(null);
  const [checkIn, setCheckIn] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [nights, setNights] = useState(1);
  const [guests, setGuests] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

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

      if (error || !data) throw new Error('Kode promo tidak ditemukan');
      if (data.status !== 'Active') throw new Error('Promo sudah tidak aktif');
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error('Promo sudah kadaluarsa');
      if (data.service_type && data.service_type !== 'villa') throw new Error('Promo tidak berlaku untuk layanan ini');

      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };

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
    if (paymentMethod === 'WiraPay' && balance < totalPrice) {
      toast.error('Saldo WiraPay tidak mencukupi. Pilih QRIS untuk bayar langsung.');
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
      if (paymentMethod !== 'QRIS') toast.success('Permintaan reservasi terkirim, menunggu konfirmasi pemilik villa.');
    } catch (err) {
      toast.error(err.message || 'Reservasi gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          WiraVilla (Sewa Villa & Penginapan)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Pilihan villa pantai Senggigi, bukit Kuta Mandalika, & sejuknya Sembalun Rinjani
        </p>
      </div>

      {/* Filter Area Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {areas.map((a) => (
          <button
            key={a}
            onClick={() => setArea(a)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition shadow-sm ${
              area === a
                ? 'bg-primary text-white ring-2 ring-primary/30'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            {a === 'Semua' ? '🏖️ Semua Lokasi' : `📍 ${a}`}
          </button>
        ))}
      </div>

      {/* Daftar Kartu Villa */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((villa) => (
          <Card
            key={villa.id}
            onClick={() => {
              setSelectedVilla(villa);
              setActivePromo(null);
              setPromoCode('');
              setPromoError('');
            }}
            className="overflow-hidden cursor-pointer hover:shadow-xl hover:border-primary/50 transition-all p-0 border border-slate-200 dark:border-slate-700 group flex flex-col"
          >
            <div className="h-48 bg-slate-200 relative overflow-hidden">
              <img
                src={villa.image}
                alt={villa.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-3 right-3 bg-white/95 dark:bg-slate-900/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-sm">
                <Star size={13} className="text-amber-500" fill="currentColor" /> {villa.rating}
              </div>
              <div className="absolute bottom-3 left-3 bg-primary text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                {villa.area}
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-1.5">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug group-hover:text-primary transition-colors">
                    {villa.name}
                  </h3>
                  <span className="text-sm font-extrabold text-primary whitespace-nowrap ml-2">
                    {formatRupiah(villa.pricePerNight)}
                    <span className="text-[10px] text-slate-400 font-normal">/mlm</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                  <MapPin size={13} /> {villa.bedrooms} Kamar Tidur • Kolam Renang Privat
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {villa.amenities.map((am) => (
                    <span
                      key={am}
                      className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium"
                    >
                      ✓ {am}
                    </span>
                  ))}
                </div>
              </div>

              <Button size="sm" className="w-full font-bold text-xs">
                Lihat & Pesan Villa
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL RESERVASI VILLA */}
      {selectedVilla && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedVilla(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleConfirmBooking} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Reservasi {selectedVilla.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <MapPin size={12} /> {selectedVilla.area}, Lombok
                  </p>
                </div>

                <div className="h-40 rounded-2xl overflow-hidden relative">
                  <img
                    src={selectedVilla.image}
                    alt={selectedVilla.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2.5 py-1 rounded-lg">
                    {formatRupiah(selectedVilla.pricePerNight)} / malam
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Tanggal Check-In
                    </label>
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Berapa Malam
                    </label>
                    <select
                      value={nights}
                      onChange={(e) => setNights(Number(e.target.value))}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none font-bold"
                    >
                      {[1, 2, 3, 4, 5, 7, 14].map((n) => (
                        <option key={n} value={n}>
                          {n} Malam
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Jumlah Tamu
                  </label>
                  <select
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {[1, 2, 3, 4, 6, 8, 10].map((g) => (
                      <option key={g} value={g}>
                        {g} Tamu
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pilihan Metode Bayar */}
                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Metode Pembayaran
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('WiraPay')}
                      className={`p-3 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'WiraPay'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">WiraPay</p>
                      <p className="text-[10px] text-slate-500">Saldo: {formatRupiah(balance)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('QRIS')}
                      className={`p-3 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'QRIS'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">QRIS</p>
                      <p className="text-[10px] text-slate-500">Scan &amp; bayar langsung</p>
                    </button>
                  </div>
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
                        onClick={handleRemovePromo}
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
                        type="button"
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

                {/* Total Biaya */}
                <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl flex justify-between items-center text-xs">
                  <div>
                    <p className="text-slate-500">Total Reservasi ({nights} malam):</p>
                    {activePromo && (
                      <p className="text-[10px] text-slate-400 line-through">{formatRupiah(subtotalPrice)}</p>
                    )}
                    <p className="text-lg font-extrabold text-primary">{formatRupiah(totalPrice)}</p>
                  </div>
                  <ShieldCheck size={24} className="text-green-500" />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => setSelectedVilla(null)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 font-bold text-xs"
                    disabled={loading}
                  >
                    {loading ? 'Memproses...' : 'Konfirmasi Reservasi'}
                  </Button>
                </div>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
