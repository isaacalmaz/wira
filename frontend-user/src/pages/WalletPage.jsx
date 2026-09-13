import { useState, useEffect } from 'react';
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
  AlertTriangle,
  Check,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import QRISCard from '../components/common/QRISCard';
import { formatRupiah } from '../utils/formatRupiah';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import {
  createTopUpRequest,
  cancelTopUpRequest,
  calculateUniqueTopUpAmount,
  getAvailableUniqueCode,
  fetchUserTopUpRequests,
  formatAmountWithUniqueHighlight,
} from '../services/topupService';
import { toast } from 'react-hot-toast';

export default function WalletPage() {
  const { balance, transactions, transfer, pay } = useWallet();

  // Modal States
  const [modalType, setModalType] = useState(null); // 'topup', 'transfer', 'qris', null
  const [topUpStep, setTopUpStep] = useState(1); // 1: input, 2: instruction
  const [baseAmount, setBaseAmount] = useState(50000);
  const [uniqueCode, setUniqueCode] = useState(0);
  const [finalAmount, setFinalAmount] = useState(50000);
  const [copiedNominal, setCopiedNominal] = useState(false);
  const [pendingTopUps, setPendingTopUps] = useState([]);
  const [viewingPendingId, setViewingPendingId] = useState(null); // Tracks if currently reviewing an existing pending top-up

  // Transfer States
  const [transferPhone, setTransferPhone] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [loading, setLoading] = useState(false);

  // QRIS Payment State
  const [qrisAmount, setQrisAmount] = useState('');
  const [merchantName, setMerchantName] = useState('Warung Ayam Taliwang H. Moerad');

  const quickAmounts = [20000, 50000, 100000, 200000, 500000];

  const { user } = useAuth();

  const loadPendingTopUps = async () => {
    if (!user?.id) {
      setPendingTopUps([]);
      return;
    }
    const data = await fetchUserTopUpRequests(supabase, user.id);
    setPendingTopUps(data);
  };

  useEffect(() => {
    loadPendingTopUps();

    const handleFocus = () => {
      loadPendingTopUps();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPendingTopUps();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const handleCancelPending = async (requestId) => {
    if (!requestId || loading) return;
    if (!window.confirm('Batalkan permintaan Top Up ini? Kode unik akan dibebaskan.')) return;

    setLoading(true);
    try {
      await cancelTopUpRequest(supabase, requestId, user?.id);
      toast.success('Permintaan Top Up berhasil dibatalkan');
      if (viewingPendingId === requestId) {
        setModalType(null);
        setViewingPendingId(null);
        setTopUpStep(1);
      }
      await loadPendingTopUps();
    } catch (err) {
      toast.error(err.message || 'Gagal membatalkan permintaan');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, label = 'Nominal') => {
    let copied = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(String(text));
        copied = true;
      } catch (_) {
        // Clipboard permission denied or iframe sandboxed; fallback to execCommand below
      }
    }
    if (!copied) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = String(text);
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (_) {}
    }
    if (copied) {
      toast.success(`${label} disalin!`);
      return true;
    } else {
      toast.error('Gagal menyalin ke clipboard');
      return false;
    }
  };

  const handleProceedToPayment = async () => {
    if (loading) return;
    if (!user) {
      toast.error('Silakan login terlebih dahulu untuk melakukan Top Up');
      return;
    }
    if (!baseAmount || Number(baseAmount) < 10000) {
      toast.error('Minimal top up adalah Rp 10.000');
      return;
    }
    setLoading(true);
    try {
      const code = await getAvailableUniqueCode(supabase, baseAmount);
      const calc = calculateUniqueTopUpAmount(baseAmount, code);
      setBaseAmount(calc.baseAmount);
      setUniqueCode(calc.uniqueCode);
      setFinalAmount(calc.totalAmount);
      setViewingPendingId(null);
      setTopUpStep(2);
    } catch (err) {
      toast.error(err.message || 'Nominal tidak valid');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNominal = async () => {
    const ok = await copyToClipboard(
      finalAmount,
      `Nominal Rp ${finalAmount.toLocaleString('id-ID')}`
    );
    if (ok) {
      setCopiedNominal(true);
      setTimeout(() => setCopiedNominal(false), 2500);
    }
  };

  const handleTopUpConfirm = async () => {
    if (loading) return;

    // If viewing an already created pending request, avoid duplicate insertions
    if (viewingPendingId) {
      toast.success('Permintaan Top Up ini sudah tercatat dan sedang menunggu verifikasi admin.');
      setModalType(null);
      setViewingPendingId(null);
      setTopUpStep(1);
      return;
    }

    if (!user) {
      toast.error('Silakan login terlebih dahulu');
      return;
    }
    setLoading(true);
    try {
      const created = await createTopUpRequest(supabase, {
        userId: user.id,
        amount: finalAmount,
      });
      const recordedAmount = created?.amount ? Number(created.amount) : finalAmount;
      toast.success(`Permintaan Top Up Rp ${recordedAmount.toLocaleString('id-ID')} berhasil. Menunggu verifikasi admin.`);
      setModalType(null);
      setViewingPendingId(null);
      setTopUpStep(1);
      await loadPendingTopUps();
    } catch (err) {
      toast.error(err.message || 'Gagal membuat permintaan top up');
    } finally {
      setLoading(false);
    }
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
              setViewingPendingId(null);
              setModalType('topup');
              setTopUpStep(1);
              setBaseAmount(50000);
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

      {/* Permintaan Top-Up Menunggu Verifikasi */}
      {pendingTopUps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Clock size={16} /> Menunggu Verifikasi Pembayaran ({pendingTopUps.length})
            </h3>
            <span className="text-[11px] text-slate-400">QRIS Statis DANA</span>
          </div>

          <div className="space-y-2.5">
            {pendingTopUps.map((p) => {
              const pFormatted = formatAmountWithUniqueHighlight(p.amount);
              return (
                <div
                  key={p.id}
                  className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-base text-slate-900 dark:text-white inline-flex items-baseline flex-nowrap whitespace-nowrap gap-0.5">
                        <span>{pFormatted.prefix}</span>
                        <span className="text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded font-mono underline decoration-amber-500 shrink-0">
                          {pFormatted.uniqueDigits}
                        </span>
                      </span>
                      <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-bold px-2 py-0.5 rounded-full">
                        Menunggu Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Wajib transfer tepat <strong className="text-amber-700 dark:text-amber-300">{pFormatted.fullFormatted}</strong> (termasuk 3 digit unik).
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(p.amount, `Nominal ${pFormatted.fullFormatted}`)}
                      className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 px-2.5 py-1.5 rounded-xl transition"
                      title="Salin nominal untuk transfer"
                    >
                      <Copy size={13} />
                      <span>Salin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const code = Number(p.amount) % 1000;
                        const base = Number(p.amount) - code;
                        setBaseAmount(base);
                        setUniqueCode(code);
                        setFinalAmount(Number(p.amount));
                        setViewingPendingId(p.id);
                        setModalType('topup');
                        setTopUpStep(2);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-white bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-xl transition shadow-sm"
                    >
                      <QrCode size={13} />
                      <span>Lihat QRIS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelPending(p.id)}
                      disabled={loading}
                      className="flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-2 py-1.5 rounded-xl transition border border-rose-200/60 dark:border-rose-800/60"
                      title="Batalkan permintaan top up"
                    >
                      <X size={13} />
                      <span>Batal</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setModalType(null);
                setViewingPendingId(null);
                setTopUpStep(1);
              }}
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
                    Pilih nominal isi ulang saldo dompet digital Anda
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
                        onClick={() => setBaseAmount(amt)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${
                          baseAmount === amt
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
                        step="1000"
                        placeholder="Min. 10.000"
                        value={baseAmount || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBaseAmount(val === '' ? '' : Math.max(0, Number(val)));
                        }}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white font-bold text-base focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                      Metode Pembayaran
                    </label>
                    {/* Single QRIS Payment Flow - VA options eliminated */}
                    <div className="p-3.5 rounded-2xl border-2 border-primary bg-primary/5 dark:bg-primary/10 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md">
                          <QrCode size={22} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            Pembayaran via QRIS (Wajib Sesuai Nominal)
                            <span className="text-[10px] bg-green-500 text-white font-semibold px-2 py-0.5 rounded-full">
                              Aktif
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            QRIS Statis DANA • Semua E-Wallet & M-Banking
                          </p>
                        </div>
                      </div>
                      <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                        <Check size={13} strokeWidth={3} />
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full py-3 text-sm font-bold shadow-lg shadow-primary/20"
                  onClick={handleProceedToPayment}
                  disabled={loading || !baseAmount || Number(baseAmount) < 10000}
                >
                  {loading
                    ? 'Menyiapkan Kode Unik...'
                    : `Lanjut ke Pembayaran QRIS (${formatRupiah(Number(baseAmount) || 0)})`}
                </Button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-900/40 text-primary mb-2 shadow-inner">
                    <QrCode size={26} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Pembayaran QRIS Statis DANA
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Scan barcode di bawah lalu transfer tepat sesuai nominal unik
                  </p>
                </div>

                {/* Standardized QRIS Card */}
                <QRISCard />

                {/* Total Payment with Highlighted 3 Unique Digits */}
                {(() => {
                  const formatted = formatAmountWithUniqueHighlight(finalAmount);
                  return (
                    <div className="bg-slate-50 dark:bg-slate-900/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                           Total Tagihan Pembayaran
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyNominal}
                          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-cyan-700 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition shrink-0"
                          title="Salin Nominal Pembayaran"
                        >
                          {copiedNominal ? (
                            <>
                              <Check size={13} className="text-green-600" />
                              <span className="text-green-600 font-bold">Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Salin Nominal</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Prominent Bold Nominal with Distinct Highlight on Last 3 Digits */}
                      <div className="text-center py-2.5 px-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden">
                        <p className="inline-flex items-baseline justify-center flex-nowrap whitespace-nowrap gap-0.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums max-w-full">
                          <span>{formatted.prefix}</span>
                          <span className="text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-300 dark:border-amber-700 underline decoration-amber-500 decoration-2 shrink-0">
                            {formatted.uniqueDigits}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Nominal Pokok: Rp {Number(baseAmount).toLocaleString('id-ID')} + Kode Unik:{' '}
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            +{uniqueCode}
                          </span>
                        </p>
                      </div>

                      {/* Info Banner when reviewing existing pending top-up */}
                      {viewingPendingId && (
                        <div className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 py-2 px-3 rounded-xl border border-amber-300 dark:border-amber-700 flex items-center justify-center gap-1.5">
                          <Clock size={14} className="shrink-0" />
                          <span>Status: Menunggu verifikasi admin untuk transfer ini</span>
                        </div>
                      )}

                      {/* Important Warning Instruction Box */}
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex gap-2.5 text-amber-800 dark:text-amber-200 text-xs">
                        <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold">
                            PENTING: Wajib transfer tepat hingga 3 digit terakhir ({formatted.uniqueDigits})!
                          </p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                            Jangan bulatkan nominal. 3 digit terakhir adalah kode verifikasi otomatis admin. Seluruh nominal akan masuk 100% ke saldo WiraPay Anda.
                          </p>
                        </div>
                      </div>

                      {/* Step-by-Step Instructions */}
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          Panduan Transfer:
                        </p>
                        <ol className="list-decimal list-inside space-y-0.5 pl-1">
                          <li>Buka aplikasi pembayaran (DANA, BCA, Mandiri, GoPay, OVO, ShopeePay, dll).</li>
                          <li>Scan QRIS di atas.</li>
                          <li>Masukkan nominal transfer PERSIS: <strong>Rp {finalAmount.toLocaleString('id-ID')}</strong>.</li>
                          <li>Setelah pembayaran selesai, tekan tombol konfirmasi di bawah.</li>
                        </ol>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setViewingPendingId(null);
                      setTopUpStep(1);
                    }}
                  >
                    {viewingPendingId ? 'Top Up Baru' : 'Ubah Nominal'}
                  </Button>
                  <Button
                    className="flex-1 font-bold shadow-lg shadow-primary/20"
                    onClick={handleTopUpConfirm}
                    disabled={loading}
                  >
                    {loading ? 'Memproses...' : viewingPendingId ? 'Tutup (Sudah Transfer)' : 'Saya Sudah Transfer'}
                  </Button>
                </div>

                {viewingPendingId && (
                  <button
                    type="button"
                    onClick={() => handleCancelPending(viewingPendingId)}
                    disabled={loading}
                    className="w-full text-center text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition flex items-center justify-center gap-1 border border-dashed border-rose-200 dark:border-rose-900/50"
                  >
                    <X size={14} />
                    <span>Batalkan Permintaan Top Up Ini</span>
                  </button>
                )}
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
