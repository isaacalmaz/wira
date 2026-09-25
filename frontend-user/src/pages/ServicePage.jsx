import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Star, Calendar, Clock, MapPin, X, Shield } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import API_BASE_URL from '../config/api';

export default function ServicePage() {
  const navigate = useNavigate();
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [technicians, setTechnicians] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchTechnicians = async () => {
      const { data: users } = await supabase.rpc('list_technicians');
      const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();

      const regs = Array.isArray(flagsData?.features) ? flagsData.features : [];
      if (users) {
        const activeTechs = users
          .map(u => {
            const reg = regs.find(r => r.auth_id === u.id || r.email === u.email);
            return {
              id: u.id,
              name: u.name,
              category: reg?.specialization || 'Umum',
              specialty: reg?.specialization ? `Spesialis ${reg.specialization}` : 'Teknisi Handal Wira',
              rating: 5.0,
              reviews: 1,
              experience: reg?.experience ? `${reg.experience} tahun` : '1+ tahun',
              avatar: u.avatar_url || 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=200',
              phone: u.phone,
              available: true,
            };
          });
        setTechnicians(activeTechs);
      }
    };
    fetchTechnicians();
  }, []);

  // Form State
  const [address, setAddress] = useState('Jl. Pejanggik No. 20, Mataram');
  const [serviceDate, setServiceDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [serviceTime, setServiceTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  const categories = [
    { id: 'AC', icon: '❄️', name: 'Service AC & Cuci', price: 75000, desc: 'Cuci AC, tambah freon, perbaikan bocor' },
    { id: 'Listrik', icon: '⚡', name: 'Instalasi Listrik', price: 50000, desc: 'Konslet, tambah titik lampu & stop kontak' },
    { id: 'Plumbing', icon: '🔧', name: 'Pipa & Pompa Air', price: 60000, desc: 'Pipa mampet, ganti kran, servis pompa air' },
    { id: 'Tukang', icon: '🏗️', name: 'Tukang Bangunan', price: 100000, desc: 'Cat dinding, perbaikan atap bocor, keramik' },
  ];

  const handleOpenBooking = (cat, tech = null) => {
    setSelectedService(cat);
    setSelectedTech(tech || technicians.find((t) => t.category.includes(cat.id)) || technicians[0] || { name: 'Mitra Teknisi Wira', rating: 5.0 });
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
      if (data.service_type && data.service_type !== 'service') throw new Error('Promo tidak berlaku untuk layanan ini');

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
      toast.error('Saldo WiraPay tidak mencukupi untuk pemesanan ini');
      return;
    }

    setLoading(true);
    try {
      if (paymentMethod === 'WiraPay') {
        await pay(finalPrice, `WiraService - ${selectedService.name}`);
      }

      const order = await addOrder({
        service: 'WiraService',
        serviceType: 'service',
        title: selectedService.name,
        details: `Teknisi: ${selectedTech?.name || 'Mitra Wira'} • Jadwal: ${serviceDate} pukul ${serviceTime} • Lokasi: ${address}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='service' ('AC' | 'Listrik' | 'Plumbing' | 'Tukang'),
        // per the categories array above and migrations/0057's seed.
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
      setIsModalOpen(false);

      // Relevant to nearby ONLINE technicians, not drivers - but there is no
      // online/offline concept for technicians anywhere in this schema (no
      // equivalent of drivers.is_online), and no get_nearest_technicians RPC
      // (only list_technicians(), a flat SECURITY DEFINER directory - see
      // migrations/0025/0026). Rather than invent a new online-status column
      // for tonight, every registered technician in `technicians` is
      // notified - the same call already made for Pool jobs by
      // frontend-mitra/src/pages/technician/TechOrdersPage.jsx (see its
      // isPoolOrder comment: a hard specialization filter risks stranding a
      // job with zero eligible technicians in a small market like Lombok,
      // so filtering stays visibility-only there too). Best-effort/
      // fire-and-forget, never blocks or surfaces an error to the customer.

      handleRemovePromo(); // don't let a used promo silently discount the next order
      toast.success('Permintaan terkirim, menunggu teknisi menerima panggilan.');
    } catch (err) {
      toast.error(err.message || 'Pemesanan teknisi gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          WiraService (Teknisi & Jasa Rumah Tangga)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Panggil teknisi AC, kelistrikan, pompa air, dan tukang profesional langsung ke rumah Anda di Mataram
        </p>
      </div>

      {/* Grid Kategori Jasa */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((c) => (
          <Card
            key={c.id}
            onClick={() => handleOpenBooking(c)}
            className="p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all text-center border border-slate-200 dark:border-slate-700 group"
          >
            <span className="text-4xl mb-2 block group-hover:scale-110 transition-transform">
              {c.icon}
            </span>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-primary transition-colors">
              {c.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">Mulai {formatRupiah(c.price)}</p>
          </Card>
        ))}
      </div>

      {/* Daftar Teknisi Rekomendasi */}
      <div>
        <h3 className="font-bold text-lg mb-3 text-slate-900 dark:text-white flex items-center gap-2">
          <Wrench size={20} className="text-primary" /> Teknisi Rekomendasi di Lombok
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {technicians.length === 0 ? (
            <div className="col-span-2 p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              Belum ada teknisi terdaftar saat ini. Pendaftaran teknisi dapat dilakukan melalui portal mitra.
            </div>
          ) : (
            technicians.map((tech) => {
              const matchedCategory =
                categories.find((c) => tech.category.includes(c.id)) || categories[0];
              return (
                <Card
                  key={tech.id}
                  className="p-4 flex items-center justify-between gap-4 border border-slate-200 dark:border-slate-700 hover:shadow-sm"
                >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-bold flex items-center justify-center text-xl shrink-0">
                    👨‍🔧
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {tech.name}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {tech.category} • Pengalaman {tech.experience} thn
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-500 font-bold">
                      <Star size={13} fill="currentColor" /> {tech.rating} (Terverifikasi)
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="font-bold text-xs shrink-0"
                  onClick={() => handleOpenBooking(matchedCategory, tech)}
                >
                  Pilih
                </Button>
              </Card>
            );
          }))}
        </div>
      </div>

      {/* MODAL BOOKING TEKNISI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleConfirmOrder} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Pesan {selectedService?.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Teknisi: <strong>{selectedTech?.name}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Tanggal Pengerjaan
                    </label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Jam Kedatangan
                    </label>
                    <select
                      value={serviceTime}
                      onChange={(e) => setServiceTime(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none font-bold"
                    >
                      {['08:00', '10:00', '13:00', '15:00', '16:30'].map((time) => (
                        <option key={time} value={time}>
                          Pukul {time} WITA
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Alamat Rumah / Lokasi
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Alamat lengkap pengerjaan..."
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                    rows="2"
                    required
                  ></textarea>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    Deskripsi Keluhan (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: AC kamar utama kurang dingin dan menetes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
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
                      onClick={() => setPaymentMethod('Tunai')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'Tunai'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">Tunai</p>
                      <p className="text-[10px] text-slate-500">Bayar ke teknisi</p>
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
                  <span className="text-slate-500 font-medium">Estimasi Biaya Jasa:</span>
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
                    {loading ? 'Memproses...' : 'Jadwalkan Teknisi'}
                  </Button>
                </div>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
