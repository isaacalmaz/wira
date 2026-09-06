import { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  CheckCircle2,
  Copy,
  X,
  Building2,
  PhoneCall,
  Clock,
  Sparkles,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { toast } from 'react-hot-toast';

export default function WalletPage() {
  const { balance, transactions, topUp, transfer, pay } = useWallet();

  // Modal States
  const [modalType, setModalType] = useState(null); // 'topup', 'transfer', 'qris', null
  const [topUpStep, setTopUpStep] = useState(1); // 1: input, 2: instruction
  const [topUpAmount, setTopUpAmount] = useState(50000);
  const [topUpMethod, setTopUpMethod] = useState('BCA Virtual Account');

  // Transfer States
  const [transferPhone, setTransferPhone] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [loading, setLoading] = useState(false);

  // QRIS Payment State
  const [qrisAmount, setQrisAmount] = useState('');
  const [merchantName, setMerchantName] = useState('Warung Ayam Taliwang H. Moerad');

  const quickAmounts = [20000, 50000, 100000, 200000, 500000];

  const handleTopUpConfirm = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    await topUp(topUpAmount, topUpMethod);
    setLoading(false);
    toast.success(`Top Up ${formatRupiah(topUpAmount)} Berhasil!`);
    setModalType(null);
    setTopUpStep(1);
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferPhone || !transferAmount) {
      toast.error('Mohon isi nomor HP dan nominal transfer');
      return;
    }
    const amt = Number(transferAmount);
    if (amt <= 0) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (amt > balance) {
      toast.error('Saldo WiraPay Anda tidak mencukupi');
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      await transfer(amt, transferPhone, 'Pengguna Wira');
      toast.success(`Berhasil transfer ${formatRupiah(amt)} ke ${transferPhone}`);
      setModalType(null);
      setTransferPhone('');
      setTransferAmount('');
      setTransferNote('');
    } catch (err) {
      toast.error(err.message || 'Transfer gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleQrisPay = async (e) => {
    e.preventDefault();
    const amt = Number(qrisAmount);
    if (!amt || amt <= 0) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (amt > balance) {
      toast.error('Saldo WiraPay Anda tidak mencukupi');
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      await pay(amt, `Bayar QRIS - ${merchantName}`);
      toast.success(`Pembayaran ${formatRupiah(amt)} Berhasil!`);
      setModalType(null);
      setQrisAmount('');
    } catch (err) {
      toast.error(err.message || 'Pembayaran gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Kartu Saldo WiraPay */}
      <div className="bg-gradient-to-br from-cyan-600 via-primary to-cyan-800 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute -top-6 -right-6 p-4 opacity-15 pointer-events-none">
          <Wallet size={160} />
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
            WiraPay Dompet Digital
          </span>
          <Sparkles size={18} className="text-amber-300 animate-pulse" />
        </div>

        <p className="text-sm opacity-90 mb-1">Saldo Tersedia</p>
        <p className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6">
          {formatRupiah(balance)}
        </p>

        <div className="flex justify-between gap-3">
          <button
            onClick={() => {
              setModalType('topup');
              setTopUpStep(1);
            }}
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <ArrowUpRight size={18} className="text-green-300" />
            <span>Top Up</span>
          </button>
          <button
            onClick={() => setModalType('transfer')}
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <ArrowDownLeft size={18} className="text-amber-300" />
            <span>Transfer</span>
          </button>
          <button
            onClick={() => setModalType('qris')}
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <QrCode size={18} className="text-cyan-200" />
            <span>Bayar QRIS</span>
          </button>
        </div>
      </div>

      {/* Riwayat Transaksi */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">
            Riwayat Mutasi WiraPay
          </h3>
          <span className="text-xs text-slate-500">{transactions.length} transaksi</span>
        </div>

        <Card className="divide-y divide-slate-100 dark:divide-slate-800 p-0 overflow-hidden shadow-sm">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Belum ada riwayat transaksi
            </div>
          ) : (
            transactions.map((trx) => (
              <div
                key={trx.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      trx.type === 'income'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {trx.type === 'income' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">
                      {trx.desc}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock size={11} /> {trx.date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`font-bold text-sm sm:text-base ${
                      trx.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {trx.type === 'income' ? '+' : '-'}
                    {formatRupiah(trx.amount)}
                  </span>
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                    {trx.status || 'Berhasil'}
                  </p>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* MODAL 1: TOP UP SALDO */}
      {modalType === 'topup' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 relative">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <X size={20} />
            </button>

            {topUpStep === 1 ? (
              <>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Top Up WiraPay
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Pilih nominal isi ulang saldo Anda
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Pilih Nominal Cepat
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {quickAmounts.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTopUpAmount(amt)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${
                          topUpAmount === amt
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {formatRupiah(amt)}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                      Atau Masukkan Nominal Lain
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-slate-400 font-bold text-sm">
                        Rp
                      </span>
                      <input
                        type="number"
                        min="10000"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(Number(e.target.value))}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white font-bold text-base focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                      Pilih Jalur Pembayaran
                    </label>
                    <div className="space-y-2">
                      {[
                        { id: 'BCA Virtual Account', icon: '🏦', name: 'BCA Virtual Account' },
                        { id: 'BRI Virtual Account', icon: '🏦', name: 'BRI Virtual Account' },
                        { id: 'Mandiri Virtual Account', icon: '🏦', name: 'Mandiri Livin' },
                        { id: 'QRIS All Payment', icon: '📱', name: 'QRIS (Gopay, OVO, Dana, Shopee)' },
                      ].map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                            topUpMethod === m.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{m.icon}</span>
                            <span className="text-xs font-semibold dark:text-white">
                              {m.name}
                            </span>
                          </div>
                          <input
                            type="radio"
                            name="method"
                            checked={topUpMethod === m.id}
                            onChange={() => setTopUpMethod(m.id)}
                            className="text-primary focus:ring-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-sm font-bold"
                  onClick={() => setTopUpStep(2)}
                  disabled={topUpAmount < 10000}
                >
                  Lanjut Pembayaran ({formatRupiah(topUpAmount)})
                </Button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-primary mx-auto flex items-center justify-center mb-2">
                    <Building2 size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Instruksi Pembayaran
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{topUpMethod}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Total Tagihan</span>
                    <span className="font-extrabold text-base text-primary">
                      {formatRupiah(topUpAmount)}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <p className="text-[11px] text-slate-500 mb-1">Nomor Virtual Account</p>
                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="font-mono font-bold text-sm tracking-widest text-slate-900 dark:text-white">
                        8213 0812 3456 7890
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText('8213081234567890');
                          toast.success('Nomor VA disalin!');
                        }}
                        className="text-primary hover:text-cyan-700 p-1 rounded"
                        title="Salin No VA"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Transfer dari m-Banking atau ATM ke nomor Virtual Account di atas. Saldo WiraPay akan langsung masuk otomatis.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setTopUpStep(1)}
                  >
                    Ubah
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleTopUpConfirm}
                    disabled={loading}
                  >
                    {loading ? 'Memproses...' : 'Saya Sudah Transfer'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: TRANSFER ANTAR USER */}
      {modalType === 'transfer' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 relative">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <X size={20} />
            </button>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Transfer WiraPay
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Kirim saldo ke sesama pengguna Wira secara instan dan bebas biaya admin
              </p>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  Nomor HP Penerima (WhatsApp)
                </label>
                <div className="relative">
                  <PhoneCall size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="Contoh: 081234567890"
                    value={transferPhone}
                    onChange={(e) => setTransferPhone(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:outline-none font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nominal Transfer
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Saldo: {formatRupiah(balance)}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-400 font-bold text-sm">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="5000"
                    max={balance}
                    placeholder="Minimal Rp 5.000"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-base font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  Catatan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Untuk bayar makan / patungan..."
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setModalType(null)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="flex-1 font-bold"
                  disabled={loading || balance < Number(transferAmount)}
                >
                  {loading ? 'Mengirim...' : 'Kirim Sekarang'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: BAYAR QRIS */}
      {modalType === 'qris' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 relative text-center">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <X size={20} />
            </button>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Bayar QRIS Merchant
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Scan barcode merchant di toko/resto di Lombok
              </p>
            </div>

            {/* Visualisasi Barcode QRIS */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-primary/40 inline-block mx-auto">
              <div className="w-40 h-40 bg-white rounded-xl p-2 flex items-center justify-center shadow-inner relative overflow-hidden">
                <QrCode size={130} className="text-slate-800" />
                <div className="absolute inset-0 bg-primary/10 flex items-center justify-center animate-pulse pointer-events-none"></div>
              </div>
              <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mt-2">
                Merchant: {merchantName}
              </p>
            </div>

            <form onSubmit={handleQrisPay} className="space-y-4 text-left">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  Nominal Pembayaran
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-400 font-bold text-sm">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1000"
                    placeholder="0"
                    value={qrisAmount}
                    onChange={(e) => setQrisAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-base font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 font-bold"
                disabled={loading || !qrisAmount || Number(qrisAmount) > balance}
              >
                {loading ? 'Memproses...' : 'Konfirmasi Bayar'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
