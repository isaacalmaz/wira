import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { Waves, Sparkles, CheckCircle2, X, MapPin, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PoolPage() {
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [selectedService, setSelectedService] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  const [orderSuccess, setOrderSuccess] = useState(false);

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
    setOrderSuccess(false);
    setIsModalOpen(true);
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!selectedService) return;

    if (paymentMethod === 'WiraPay' && balance < selectedService.price) {
      toast.error('Saldo WiraPay Anda tidak mencukupi untuk pemesanan ini');
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));

      if (paymentMethod === 'WiraPay') {
        await pay(selectedService.price, `WiraPool - ${selectedService.name}`);
      }

      await addOrder({
        service: 'WiraPool',
        serviceType: 'pool',
        title: selectedService.name,
        details: `Ukuran: ${poolSize} • Lokasi: ${address} • Kunjungan: ${visitDate}`,
        price: selectedService.price,
        status: 'Dijadwalkan',
        paymentMethod: paymentMethod,
      });

      setOrderSuccess(true);
      toast.success('Pemesanan Perawatan Kolam Renang Berhasil!');
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

            {!orderSuccess ? (
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

                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Total Tarif:</span>
                  <span className="font-extrabold text-base text-primary">
                    {formatRupiah(selectedService?.price || 0)}
                  </span>
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
                      {formatRupiah(selectedService?.price || 0)} ({paymentMethod})
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full py-3 font-bold"
                  onClick={() => setIsModalOpen(false)}
                >
                  Selesai
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
