import { useState, useEffect } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { Waves, Sparkles, CheckCircle2, X, MapPin, ShieldCheck, MessageCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import ChatModal from '../components/common/ChatModal';
import API_BASE_URL from '../config/api';

export default function PoolPage() {
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [selectedService, setSelectedService] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Same technician directory RPC ServicePage.jsx uses (SECURITY DEFINER
  // list_technicians() - migrations/0025/0026) - needed here purely to have
  // a notification target list on booking, PoolPage previously never
  // fetched technicians at all.
  const [technicians, setTechnicians] = useState([]);
  useEffect(() => {
    const fetchTechnicians = async () => {
      const { data } = await supabase.rpc('list_technicians');
      if (data) setTechnicians(data);
    };
    fetchTechnicians();
  }, []);

  // Form State
  const [address, setAddress] = useState('Villa Sunset View, Senggigi, Lombok Barat');
  const [poolSize, setPoolSize] = useState('Sedang (20-50 m²)');
  const [visitDate, setVisitDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);
  const [orderPending, setOrderPending] = useState(false); // request sent, awaiting technician acceptance
  const [orderSuccess, setOrderSuccess] = useState(false); // technician accepted
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // The actual amount charged - captured at booking time so the pending/
  // success screens keep showing the real discounted total even after
  // activePromo is cleared post-booking.
  const [paidPrice, setPaidPrice] = useState(0);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Dengarkan penerimaan panggilan dari teknisi secara realtime
  useEffect(() => {
    if (!activeOrderId) return;

    const channel = supabase
      .channel(`order_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrderId}` },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'accepted') {
            setOrderPending(false);
            setOrderSuccess(true);
            toast.success('Teknisi telah menerima permintaan Anda!', { icon: '💧' });
          } else if (newStatus === 'cancelled') {
            setOrderPending(false);
            setIsModalOpen(false);
            toast.error('Mohon maaf, tidak ada teknisi yang tersedia saat ini.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  const services = [
    { id: 'S1', name: 'Pembersihan Rutin', price: 200000, desc: 'Vakum lantai dasar kolam, sikat dinding lumut, & kuras daun' },
    { id: 'S2', name: 'Treatment Air & Klorinasi', price: 150000, desc: 'Pengecekan pH air, kaporit, soda ash & tawas agar air bening kristal' },
    { id: 'S3', name: 'Servis Pompa & Filter Kolam', price: 300000, desc: 'Perbaikan sirkulasi mesin pompa & penggantian pasir silika filter' },
  ];

  const monthlyPackage = {
    id: 'MONTHLY',
    name: 'Paket Langganan Kolam Bulanan',
    price: 500000,
    desc: 'Perawatan rutin 4x sebulan (seminggu sekali) + chemical lengkap untuk villa & rumah pribadi',
  };

  const handleOpenBooking = (srv) => {
    setSelectedService(srv);
    setOrderPending(false);
    setOrderSuccess(false);
    setActiveOrderId(null);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setIsModalOpen(true);
  };

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
      if (data.service_type && data.service_type !== 'pool') throw new Error('Promo tidak berlaku untuk layanan ini');

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

  const calculateFinalPrice = () => {
    const basePrice = selectedService?.price || 0;
    if (!activePromo) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!selectedService) return;

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error('Saldo WiraPay Anda tidak mencukupi untuk pemesanan ini');
      return;
    }

    setLoading(true);
    try {
      if (paymentMethod === 'WiraPay') {
        await pay(finalPrice, `WiraPool - ${selectedService.name}`);
      }

      const order = await addOrder({
        service: 'WiraPool',
        serviceType: 'pool',
        title: selectedService.name,
        details: `Ukuran: ${poolSize} • Lokasi: ${address} • Kunjungan: ${visitDate}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='pool' ('S1' | 'S2' | 'S3' from `services`, or
        // 'MONTHLY' from `monthlyPackage`), per migrations/0057's seed.
        rateCode: selectedService?.id || null,
        promoCode: activePromo?.code || null,
      });

      // Only counted as "used" once the order actually exists - see
      // migrations/0046's increment_promo_usage.
      if (activePromo?.id) {
        supabase.rpc('increment_promo_usage', { promo_id: activePromo.id }).then(({ error: usageErr }) => {
          if (usageErr) console.error('Gagal mencatat pemakaian promo:', usageErr);
        });
      }

      navigate(`/active-order/${order.id}`);
      setPaidPrice(finalPrice);
      setOrderPending(true);

      // Same reasoning as ServicePage.jsx: relevant to nearby ONLINE
      // technicians, but there's no online-status concept for technicians
      // and no get_nearest_technicians RPC in this schema - so every
      // registered technician is notified, matching
      // TechOrdersPage.jsx's own documented decision to keep pool-job
      // specialization visibility-only rather than a hard filter (avoids
      // stranding a pool job with zero eligible technicians in a small
      // market). Best-effort/fire-and-forget, never blocks the customer.
      if (technicians.length > 0 && order?.id) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          technicians.forEach((t) => {
            fetch(`${API_BASE_URL}/notifications/order-alert`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                userId: t.id,
                title: 'Panggilan WiraPool Baru!',
                body: `${selectedService.name} dibutuhkan di ${address}.`,
                data: { orderId: order.id, type: 'new_pool_order' },
              }),
            }).catch((err) => console.error('order-alert (technician) failed:', err));
          });
        });
      }

      handleRemovePromo(); // don't let a used promo silently discount the next order
      toast.success('Permintaan terkirim, menunggu teknisi menerima.');
    } catch (err) {
      toast.error(err.message || 'Pemesanan gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          WiraPool (Perawatan & Maintenance Kolam Renang)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Layanan spesialis pembersihan kolam renang villa & rumah pribadi di Lombok agar selalu jernih dan higienis
        </p>
      </div>

      {/* Banner Paket Langganan Bulanan */}
      <Card className="bg-gradient-to-r from-cyan-600 via-primary to-blue-600 text-white p-6 sm:p-8 border-0 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-15 pointer-events-none">
          <Waves size={160} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase bg-white/20 backdrop-blur-sm px-3 py-0.5 rounded-full">
            Paling Populer untuk Villa
          </span>
          <Sparkles size={16} className="text-amber-300" />
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">
          {monthlyPackage.name}
        </h2>
        <p className="text-xs sm:text-sm opacity-90 mb-6 max-w-lg leading-relaxed">
          {monthlyPackage.desc}. Bebas repot, kolam siap pakai setiap hari untuk tamu villa Anda.
        </p>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-2 border-t border-white/20">
          <p className="text-3xl font-extrabold tracking-tight">
            {formatRupiah(monthlyPackage.price)}
            <span className="text-xs font-normal opacity-80">/bulan</span>
          </p>
          <Button
            variant="secondary"
            className="font-bold py-2.5 px-6 shadow-md"
            onClick={() => handleOpenBooking(monthlyPackage)}
          >
            Ambil Paket Langganan
          </Button>
        </div>
      </Card>

      {/* Layanan Perawatan Satuan */}
      <div>
        <h3 className="font-bold text-lg mb-3 text-slate-900 dark:text-white flex items-center gap-2">
          <Waves size={20} className="text-primary" /> Layanan Perawatan Satuan
        </h3>
        <div className="space-y-3">
          {services.map((s) => (
            <Card
              key={s.id}
              className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 border border-slate-200 dark:border-slate-700 hover:shadow-md transition"
            >
              <div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  {s.name}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">{s.desc}</p>
                <p className="font-extrabold text-sm text-primary">
                  {formatRupiah(s.price)}
                </p>
              </div>
              <Button
                size="sm"
                className="font-bold text-xs shrink-0"
                onClick={() => handleOpenBooking(s)}
              >
                Pesan Sekarang
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* MODAL BOOKING PERAWATAN KOLAM */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            {!orderPending && !orderSuccess ? (
              <form onSubmit={handleConfirmOrder} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pesan {selectedService?.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Teknisi kolam renang Wira akan datang membawa perlengkapan lengkap
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Tanggal Kunjungan
                    </label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Ukuran Kolam
                    </label>
                    <select
                      value={poolSize}
                      onChange={(e) => setPoolSize(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none text-xs"
                    >
                      <option value="Kecil (< 20 m²)">Kecil (&lt; 20 m²)</option>
                      <option value="Sedang (20-50 m²)">Sedang (20-50 m²)</option>
                      <option value="Besar (> 50 m²)">Besar (&gt; 50 m²)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Alamat Villa / Rumah
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Alamat lengkap lokasi kolam renang..."
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                    rows="2"
                    required
                  ></textarea>
                </div>

                {/* Metode Pembayaran */}
                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Metode Pembayaran
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('WiraPay')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
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
                      onClick={() => setPaymentMethod('Transfer')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'Transfer'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">Transfer Bank</p>
                      <p className="text-[10px] text-slate-500">BCA / Mandiri</p>
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

                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Total Tarif:</span>
                  <div className="text-right">
                    {activePromo && (
                      <p className="text-[10px] text-slate-400 line-through">{formatRupiah(selectedService?.price || 0)}</p>
                    )}
                    <span className="font-extrabold text-base text-primary">
                      {formatRupiah(calculateFinalPrice())}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 font-bold text-xs"
                    disabled={loading}
                  >
                    {loading ? 'Memproses...' : 'Konfirmasi Pemesanan'}
                  </Button>
                </div>
              </form>
            ) : orderPending ? (
              /* MENUNGGU TEKNISI MENERIMA */
              <div className="text-center space-y-4 py-6">
                <div className="relative w-14 h-14 mx-auto">
                  <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <Waves size={20} className="absolute inset-0 m-auto text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Menunggu Teknisi
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-xs mx-auto">
                    Permintaan Anda sedang dikirim ke teknisi kolam terdekat. Anda akan diberitahu segera setelah diterima.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full py-3 font-bold text-xs"
                  onClick={() => setIsModalOpen(false)}
                >
                  Tutup (tetap menunggu di latar belakang)
                </Button>
              </div>
            ) : (
              /* SUKSES DIJADWALKAN */
              <div className="text-center space-y-4 py-3">
                <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full mx-auto flex items-center justify-center">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pemesanan Berhasil!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tim teknisi kolam renang telah menjadwalkan kunjungan
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Layanan:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedService?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tanggal Kunjungan:</span>
                    <span className="font-semibold text-primary">
                      {visitDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lokasi:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {address}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-slate-500 font-bold">Biaya:</span>
                    <span className="font-extrabold text-sm text-primary">
                      {formatRupiah(paidPrice)} ({paymentMethod})
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 py-3 font-bold text-xs flex items-center justify-center gap-1.5"
                    onClick={() => setIsChatOpen(true)}
                  >
                    <MessageCircle size={16} /> Chat Teknisi
                  </Button>
                  <Button
                    className="flex-1 py-3 font-bold"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Selesai
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isChatOpen && activeOrderId && (
        <ChatModal
          orderId={activeOrderId}
          onClose={() => setIsChatOpen(false)}
          receiverName="Teknisi Kolam"
        />
      )}
    </div>
  );
}
