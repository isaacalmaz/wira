import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import {
  Package,
  Truck,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  Copy,
  ArrowRight,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';

export default function SendPage() {
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [step, setStep] = useState('form'); // 'form', 'tracking'
  const [selectedPackage, setSelectedPackage] = useState('kecil');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Form State
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderAddress, setSenderAddress] = useState('');

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [itemNote, setItemNote] = useState('');

  // Tracking State
  const [trackingData, setTrackingData] = useState(null);
  const [deliveryStage, setDeliveryStage] = useState(1);

  const packages = [
    { id: 'dokumen', name: 'Dokumen', desc: 'Berkas / Kertas (< 1kg)', price: 8000, icon: '📄' },
    { id: 'kecil', name: 'Paket Kecil', desc: 'Makanan / Baju (< 5kg)', price: 12000, icon: '📦' },
    { id: 'sedang', name: 'Paket Sedang', desc: 'Elektronik / Kardus (< 15kg)', price: 18000, icon: '💼' },
    { id: 'besar', name: 'Paket Besar', desc: 'Barang Berat (< 30kg)', price: 30000, icon: '🧳' },
  ];

  const currentPkg = packages.find((p) => p.id === selectedPackage) || packages[1];

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!senderName || !senderPhone || !senderAddress || !receiverName || !receiverPhone || !receiverAddress) {
      toast.error('Mohon lengkapi seluruh data pengirim dan penerima');
      return;
    }

    if (paymentMethod === 'WiraPay' && balance < currentPkg.price) {
      toast.error('Saldo WiraPay Anda tidak mencukupi');
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));

      const resi = 'WRS-' + Math.floor(100000 + Math.random() * 900000);

      if (paymentMethod === 'WiraPay') {
        await pay(currentPkg.price, `WiraSend Paket ke ${receiverName}`);
      }

      await addOrder({
        service: 'WiraSend',
        serviceType: 'send',
        title: `Kirim Paket ke ${receiverName}`,
        details: `No. Resi: ${resi} • ${currentPkg.name} (${senderAddress} ➔ ${receiverAddress})`,
        price: currentPkg.price,
        status: 'Sedang Diantar',
        paymentMethod: paymentMethod,
      });

      setTrackingData({
        resi: resi,
        courier: 'Pak Wayan Artawa (Honda Beat DR 5544 KL)',
        courierPhone: '0819-8765-4321',
        sender: senderName,
        receiver: receiverName,
        from: senderAddress,
        to: receiverAddress,
        pkgName: currentPkg.name,
        price: currentPkg.price,
      });

      setStep('tracking');
      setDeliveryStage(1);
      toast.success('Kurir WiraSend Berhasil Dipesan!');
    } catch (err) {
      toast.error(err.message || 'Pemesanan kurir gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          WiraSend (Kirim Paket Kilat)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Kirim barang, makanan, dan dokumen instan sampai hari ini se-Pulau Lombok
        </p>
      </div>

      {step === 'form' ? (
        <form onSubmit={handleOrderSubmit} className="space-y-4">
          {/* Detail Pengirim */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Titik Penjemputan (Pengirim)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nama Pengirim"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder="Nomor HP Pengirim"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder="Alamat Lengkap Penjemputan (cth: Jl. Pejanggik No. 12, Mataram)"
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              rows="2"
              required
            ></textarea>
          </Card>

          {/* Detail Penerima */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Titik Pengantaran (Penerima)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nama Penerima"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder="Nomor HP Penerima"
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder="Alamat Lengkap Tujuan (cth: Komplek Puri Meninting, Senggigi)"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              rows="2"
              required
            ></textarea>
            <input
              type="text"
              placeholder="Catatan / Isi Paket (cth: Kue lapis / Dokumen sertifikat)"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </Card>

          {/* Pilih Ukuran Paket */}
          <Card className="p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              Pilih Ukuran Paket
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {packages.map((p) => {
                const isSelected = selectedPackage === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPackage(p.id)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary dark:border-primary shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-2xl mb-1 block">{p.icon}</span>
                    <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mb-1">{p.desc}</p>
                    <p className="font-extrabold text-xs text-primary">
                      {formatRupiah(p.price)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Metode Pembayaran */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Metode Pembayaran
              </p>
              <p className="text-[11px] text-slate-500">
                Pilih pembayaran via WiraPay atau Tunai (COD)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('WiraPay')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  paymentMethod === 'WiraPay'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                WiraPay ({formatRupiah(balance)})
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Tunai')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  paymentMethod === 'Tunai'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Tunai (COD)
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full py-3.5 text-sm font-bold shadow-lg"
            disabled={loading}
          >
            {loading ? 'Memesan Kurir...' : `Pesan Kurir Sekarang • ${formatRupiah(currentPkg.price)}`}
          </Button>
        </form>
      ) : (
        /* TAMPILAN LIVE TRACKING PENGIRIMAN PAKET */
        <div className="space-y-4 animate-in fade-in zoom-in duration-150">
          <Card className="p-6 text-center space-y-4 border-2 border-primary/30 shadow-xl">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center">
              <Truck size={32} className="animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Kurir Sedang Menuju Lokasi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Estimasi penjemputan paket dalam ± 10 menit
              </p>
            </div>

            {/* Kotak Nomor Resi */}
            <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Nomor Resi Resmi</p>
                <p className="font-mono font-extrabold text-base text-primary tracking-wider">
                  {trackingData?.resi}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(trackingData?.resi);
                  toast.success('No. Resi disalin!');
                }}
                className="text-primary hover:text-cyan-700 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                title="Salin Resi"
              >
                <Copy size={16} />
              </button>
            </div>

            {/* Tahapan Pengiriman */}
            <div className="text-left space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-700 text-xs">
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 ${deliveryStage >= 1 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Kurir Ditugaskan</p>
                  <p className="text-slate-500">{trackingData?.courier}</p>
                </div>
              </div>
              <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-700 ml-1.5"></div>
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 ${deliveryStage >= 2 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Paket Dijemput dari Pengirim</p>
                  <p className="text-slate-500">{trackingData?.from}</p>
                </div>
              </div>
              <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-700 ml-1.5"></div>
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 ${deliveryStage >= 3 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Dalam Perjalanan ke Penerima</p>
                  <p className="text-slate-500">{trackingData?.to} ({trackingData?.receiver})</p>
                </div>
              </div>
            </div>

            {/* Simulasi Tombol Update Pengiriman */}
            <div className="flex gap-2">
              {deliveryStage < 3 ? (
                <Button
                  className="flex-1 text-xs"
                  onClick={() => {
                    setDeliveryStage((prev) => prev + 1);
                    toast.success('Status pengiriman diperbarui!');
                  }}
                >
                  Simulasikan Perjalanan Paket ➔
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs"
                  onClick={() => {
                    setStep('form');
                    setTrackingData(null);
                    toast.success('Pengiriman WiraSend telah selesai!');
                  }}
                >
                  Paket Selesai Diterima ✓
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
