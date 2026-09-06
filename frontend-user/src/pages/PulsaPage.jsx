import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import {
  Smartphone,
  Zap,
  Droplet,
  ShieldPlus,
  CheckCircle2,
  Copy,
  Receipt,
  X,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PulsaPage() {
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [tab, setTab] = useState('Pulsa');
  const [targetNumber, setTargetNumber] = useState('');
  const [selectedNominal, setSelectedNominal] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const tabs = [
    { id: 'Pulsa', icon: Smartphone, label: 'Pulsa Reguler' },
    { id: 'Data', icon: Smartphone, label: 'Paket Data' },
    { id: 'PLN', icon: Zap, label: 'Token PLN' },
    { id: 'PDAM', icon: Droplet, label: 'Air PDAM' },
    { id: 'BPJS', icon: ShieldPlus, label: 'BPJS' },
  ];

  // Deteksi Operator Otomatis dari Prefix Nomor HP
  const detectOperator = (number) => {
    const clean = number.replace(/\D/g, '');
    if (clean.startsWith('0811') || clean.startsWith('0812') || clean.startsWith('0813') || clean.startsWith('0821') || clean.startsWith('0822') || clean.startsWith('0852') || clean.startsWith('0853')) {
      return { name: 'Telkomsel', color: 'text-red-500 bg-red-50 dark:bg-red-950/30' };
    }
    if (clean.startsWith('0814') || clean.startsWith('0815') || clean.startsWith('0816') || clean.startsWith('0855') || clean.startsWith('0856') || clean.startsWith('0857') || clean.startsWith('0858')) {
      return { name: 'Indosat IM3', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30' };
    }
    if (clean.startsWith('0817') || clean.startsWith('0818') || clean.startsWith('0819') || clean.startsWith('0859') || clean.startsWith('0877') || clean.startsWith('0878')) {
      return { name: 'XL Axiata', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30' };
    }
    if (clean.startsWith('0895') || clean.startsWith('0896') || clean.startsWith('0897') || clean.startsWith('0898') || clean.startsWith('0899')) {
      return { name: 'Tri (3)', color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30' };
    }
    if (clean.startsWith('0881') || clean.startsWith('0882') || clean.startsWith('0883') || clean.startsWith('0888')) {
      return { name: 'Smartfren', color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/30' };
    }
    return clean.length >= 4 ? { name: 'Operator Lain', color: 'text-slate-500 bg-slate-100' } : null;
  };

  const currentOperator = detectOperator(targetNumber);

  // Daftar Produk Berdasarkan Tab
  const products = {
    Pulsa: [
      { id: 'P10', nominal: 10000, price: 11500, label: 'Pulsa 10.000' },
      { id: 'P20', nominal: 20000, price: 21500, label: 'Pulsa 20.000' },
      { id: 'P50', nominal: 50000, price: 51000, label: 'Pulsa 50.000 (Populer)' },
      { id: 'P100', nominal: 100000, price: 100500, label: 'Pulsa 100.000' },
      { id: 'P150', nominal: 150000, price: 150500, label: 'Pulsa 150.000' },
      { id: 'P200', nominal: 200000, price: 199500, label: 'Pulsa 200.000' },
    ],
    Data: [
      { id: 'D1', nominal: 35000, price: 35000, label: '5GB / 30 Hari' },
      { id: 'D2', nominal: 60000, price: 60000, label: '15GB Unlimited / 30 Hari' },
      { id: 'D3', nominal: 95000, price: 95000, label: '35GB Jumbo / 30 Hari' },
      { id: 'D4', nominal: 130000, price: 130000, label: '60GB Bebas Kuota / 30 Hari' },
    ],
    PLN: [
      { id: 'PLN20', nominal: 20000, price: 22000, label: 'Token Listrik 20.000' },
      { id: 'PLN50', nominal: 50000, price: 52000, label: 'Token Listrik 50.000' },
      { id: 'PLN100', nominal: 100000, price: 102000, label: 'Token Listrik 100.000' },
      { id: 'PLN200', nominal: 200000, price: 202000, label: 'Token Listrik 200.000' },
      { id: 'PLN500', nominal: 500000, price: 502000, label: 'Token Listrik 500.000' },
      { id: 'PLN1000', nominal: 1000000, price: 1002000, label: 'Token Listrik 1.000.000' },
    ],
    PDAM: [
      { id: 'PDAM1', nominal: 85000, price: 87500, label: 'Tagihan Air PDAM Giri Menang' },
    ],
    BPJS: [
      { id: 'BPJS1', nominal: 70000, price: 72500, label: 'Iuran BPJS Kelas 3 (2 Jiwa)' },
      { id: 'BPJS2', nominal: 100000, price: 102500, label: 'Iuran BPJS Kelas 2 (1 Jiwa)' },
    ],
  };

  const activeProducts = products[tab] || products.Pulsa;
  const selectedProduct = activeProducts.find((p) => p.nominal === selectedNominal) || activeProducts[0];

  const handleCheckout = () => {
    if (!targetNumber || targetNumber.length < 9) {
      toast.error(tab === 'PLN' ? 'Masukkan nomor ID Meter PLN yang valid' : 'Masukkan nomor HP yang valid');
      return;
    }
    setShowModal(true);
  };

  const handleProcessPayment = async () => {
    if (balance < selectedProduct.price) {
      toast.error('Saldo WiraPay tidak mencukupi, silakan Top Up terlebih dahulu');
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 900));

      // Potong saldo
      const desc = `${tab === 'PLN' ? 'Beli Token PLN' : tab} ${selectedProduct.label} (${targetNumber})`;
      await pay(selectedProduct.price, desc);

      // Buat token acak untuk PLN
      const plnToken = Array.from({ length: 5 }, () => Math.floor(1000 + Math.random() * 9000)).join('-');
      const serialNumber = 'SN' + Date.now().toString().slice(-8);

      // Catat ke Order Activity
      await addOrder({
        service: 'WiraPulsa',
        serviceType: 'pulsa',
        title: desc,
        details: `${tab === 'PLN' ? 'No Token: ' + plnToken : 'No Seri: ' + serialNumber}`,
        price: selectedProduct.price,
        status: 'Selesai',
        paymentMethod: 'WiraPay',
      });

      setReceiptData({
        product: selectedProduct.label,
        target: targetNumber,
        price: selectedProduct.price,
        operator: currentOperator?.name || (tab === 'PLN' ? 'PLN Prabayar' : 'PDAM Mataram'),
        sn: tab === 'PLN' ? plnToken : serialNumber,
        isPln: tab === 'PLN',
        date: new Date().toLocaleString('id-ID'),
      });

      toast.success('Pembayaran Berhasil!');
    } catch (err) {
      toast.error(err.message || 'Pembayaran gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Pulsa & Tagihan
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Beli pulsa, paket kuota, token PLN, PDAM, dan BPJS instan di Lombok
        </p>
      </div>

      {/* Tabs Kategori Layanan */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSelectedNominal(products[t.id]?.[0]?.nominal || 50000);
              }}
              className={`px-4 py-2.5 rounded-2xl whitespace-nowrap flex items-center gap-2 text-xs sm:text-sm font-bold transition shadow-sm ${
                isActive
                  ? 'bg-primary text-white ring-2 ring-primary/40'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Form Input Nomor Tujuan */}
      <Card className="p-5 space-y-2 border border-slate-200 dark:border-slate-700">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          {tab === 'PLN'
            ? 'Nomor Meter / ID Pelanggan PLN'
            : tab === 'PDAM'
            ? 'Nomor Sambungan PDAM Lombok Barat/Mataram'
            : tab === 'BPJS'
            ? 'Nomor Kartu Keluarga / BPJS'
            : 'Nomor Handphone Penerima'}
        </label>
        <div className="relative">
          <input
            type="tel"
            placeholder={
              tab === 'PLN'
                ? 'Contoh: 1423 8921 9021'
                : 'Contoh: 081234567890'
            }
            value={targetNumber}
            onChange={(e) => setTargetNumber(e.target.value)}
            className="w-full p-3.5 pr-28 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-base font-bold tracking-wide focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {currentOperator && tab !== 'PLN' && tab !== 'PDAM' && tab !== 'BPJS' && (
            <span
              className={`absolute right-3 top-3 px-2.5 py-1 rounded-md text-xs font-bold ${currentOperator.color}`}
            >
              {currentOperator.name}
            </span>
          )}
        </div>
      </Card>

      {/* Daftar Pilihan Nominal / Paket */}
      <div>
        <h3 className="font-bold text-base mb-3 text-slate-900 dark:text-white">
          Pilih Paket / Nominal
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {activeProducts.map((p) => {
            const isSelected = selectedNominal === p.nominal;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedNominal(p.nominal)}
                className={`p-4 rounded-2xl cursor-pointer border-2 transition-all text-left relative ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary dark:border-primary shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                }`}
              >
                {isSelected && (
                  <CheckCircle2
                    size={18}
                    className="absolute top-3 right-3 text-primary"
                  />
                )}
                <p className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {p.label}
                </p>
                <p className="text-xs font-bold text-primary mt-2">
                  {formatRupiah(p.price)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tombol Aksi Beli */}
      <div className="pt-2">
        <Button
          className="w-full py-3.5 text-base font-bold shadow-lg"
          onClick={handleCheckout}
          disabled={!targetNumber}
        >
          Beli Sekarang • {formatRupiah(selectedProduct.price)}
        </Button>
      </div>

      {/* MODAL KONFIRMASI & STRUK PEMBAYARAN */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => {
                setShowModal(false);
                setReceiptData(null);
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            {!receiptData ? (
              <>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Konfirmasi Pembelian
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periksa kembali rincian transaksi Anda
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/70 p-4 rounded-2xl space-y-3 text-sm border border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Layanan:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{tab}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nomor Tujuan:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {targetNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Produk:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {selectedProduct.label}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between items-center">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Total Bayar:
                    </span>
                    <span className="font-extrabold text-lg text-primary">
                      {formatRupiah(selectedProduct.price)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-1">
                    <span>Metode: WiraPay</span>
                    <span>Sisa Saldo: {formatRupiah(balance)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowModal(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    className="flex-1 font-bold"
                    onClick={handleProcessPayment}
                    disabled={loading || balance < selectedProduct.price}
                  >
                    {loading ? 'Memproses...' : 'Bayar Sekarang'}
                  </Button>
                </div>
              </>
            ) : (
              /* Struk Digital Resmi */
              <div className="text-center space-y-4">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full mx-auto flex items-center justify-center">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Transaksi Sukses!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pembayaran Anda telah berhasil diproses
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waktu:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {receiptData.date}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tujuan:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {receiptData.target}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-bold text-primary text-sm">
                      {formatRupiah(receiptData.price)}
                    </span>
                  </div>

                  {receiptData.isPln ? (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
                      <p className="text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1">
                        20 Digit Kode Token Listrik PLN:
                      </p>
                      <p className="font-mono font-extrabold text-base tracking-widest text-amber-800 dark:text-amber-200">
                        {receiptData.sn}
                      </p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(receiptData.sn.replace(/-/g, ''));
                          toast.success('Token PLN disalin!');
                        }}
                        className="text-[10px] text-amber-700 font-bold underline mt-1"
                      >
                        Salin Angka Token
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400">No. Seri (SN):</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {receiptData.sn}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full py-3 font-bold"
                  onClick={() => {
                    setShowModal(false);
                    setReceiptData(null);
                    setTargetNumber('');
                  }}
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
