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
import { useTranslation } from '../i18n';
import { localizeTransaction } from '../utils/localizeDbText';

export default function WalletPage() {
  const { t } = useTranslation();
  const { balance, transactions, transfer } = useWallet();

  // Modal States
  const [modalType, setModalType] = useState(null); // 'topup', 'transfer', null
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
    if (!window.confirm(t('wallet.cancel_confirm'))) return;

    setLoading(true);
    try {
      await cancelTopUpRequest(supabase, requestId, user?.id);
      toast.success(t('wallet.cancel_success'));
      if (viewingPendingId === requestId) {
        setModalType(null);
        setViewingPendingId(null);
        setTopUpStep(1);
      }
      await loadPendingTopUps();
    } catch (err) {
      toast.error(t('wallet.cancel_failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, label) => {
    const copyLabel = label || t('wallet.copy_label_amount');
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
      toast.success(t('wallet.copy_success', { label: copyLabel }));
      return true;
    } else {
      toast.error(t('wallet.copy_failed'));
      return false;
    }
  };

  // Restored to the pre-Midtrans QRIS-manual flow (2026-09-19) - Midtrans's
  // merchant account isn't approved yet, so the automatic charge path below
  // (handleMidtransCharge) can't actually process a real payment right now.
  // This generates a unique 3-digit-suffix amount (getAvailableUniqueCode/
  // calculateUniqueTopUpAmount) and moves to step 2 (static QRIS + manual
  // admin verification via topup_requests), exactly as it worked before
  // Midtrans was wired in.
  const handleProceedToPayment = async () => {
    if (loading) return;
    if (!user) {
      toast.error(t('wallet.login_to_topup'));
      return;
    }
    if (!baseAmount || Number(baseAmount) < 10000) {
      toast.error(t('wallet.min_topup'));
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
      toast.error(t('wallet.topup_prepare_failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNominal = async () => {
    const ok = await copyToClipboard(
      finalAmount,
      t('wallet.copy_label_amount_value', { amount: formatRupiah(finalAmount) })
    );
    if (ok) {
      setCopiedNominal(true);
      setTimeout(() => setCopiedNominal(false), 2500);
    }
  };

  // The manual QRIS confirmation button ("Saya Sudah Transfer") calls this -
  // creates a pending topup_requests row for an admin to manually verify
  // and approve/reject (FinancePage.jsx), exactly as it worked before
  // Midtrans. Does NOT touch wallet_balance itself - only
  // approve_topup_request (migrations/0015/0022) does that, after a human
  // admin confirms the transfer actually arrived.
  const handleTopUpConfirm = async () => {
    if (loading) return;

    // If viewing an already-created pending request, avoid duplicate
    // insertions - they're just re-opening the QRIS screen to re-scan/
    // re-copy the nominal, not making a second request.
    if (viewingPendingId) {
      toast.success(t('wallet.topup_already_recorded'));
      setModalType(null);
      setViewingPendingId(null);
      setTopUpStep(1);
      return;
    }

    if (!user) {
      toast.error(t('wallet.login_to_topup'));
      return;
    }
    setLoading(true);
    try {
      const created = await createTopUpRequest(supabase, {
        userId: user.id,
        amount: finalAmount,
      });
      const recordedAmount = created?.amount ? Number(created.amount) : finalAmount;
      toast.success(t('wallet.topup_created', { amount: formatRupiah(recordedAmount) }));
      setModalType(null);
      setViewingPendingId(null);
      setTopUpStep(1);
      await loadPendingTopUps();
    } catch (err) {
      toast.error(t('wallet.topup_create_failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  // Kept intact, deliberately NOT wired to any button right now - Midtrans's
  // merchant account isn't approved yet. Re-wire handleProceedToPayment (or
  // add a second payment-method option) to call this once it is, instead of
  // deleting this working integration.
  const handleMidtransCharge = async () => {
    if (loading) return;

    if (!user) {
      toast.error(t('wallet.login_to_topup'));
      return;
    }
    setLoading(true);
    try {
      // Panggil backend API kita (asumsikan backend berjalan di URL/Port yang sesuai, untuk dev bisa localhost:5000)
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

      // /api/midtrans/charge now requires a valid Supabase session (it
      // derives the authenticated user server-side instead of trusting a
      // client-supplied user_id) - attach the access token the same way the
      // backend's auth middleware expects it everywhere else.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t('auth.session_expired'));
      }

      const response = await fetch(`${apiUrl}/api/midtrans/charge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: baseAmount,
          customer_name: user.name || 'Wira User',
          customer_email: user.email || 'user@wira.com',
          customer_phone: user.phone || '08123456789'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('wallet.midtrans_gateway_failed'));

      // Tampilkan popup Snap Midtrans
      window.snap.pay(data.token, {
        onSuccess: function(result){
          toast.success(t('wallet.midtrans_success'));
          setModalType(null);
          setTopUpStep(1);
          loadPendingTopUps();
        },
        onPending: function(result){
          toast.success(t('wallet.midtrans_pending'));
          setModalType(null);
          setTopUpStep(1);
          loadPendingTopUps();
        },
        onError: function(result){
          toast.error(t('wallet.midtrans_error'));
          setModalType(null);
          setTopUpStep(1);
        },
        onClose: function(){
          toast.error(t('wallet.midtrans_closed'));
          setModalType(null);
          setTopUpStep(1);
        }
      });

    } catch (err) {
      toast.error(t('wallet.midtrans_start_failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferPhone || !transferAmount) {
      toast.error(t('wallet.transfer_incomplete'));
      return;
    }
    const amt = Number(transferAmount);
    if (amt <= 0) {
      toast.error(t('wallet.transfer_invalid_amount'));
      return;
    }
    if (amt > balance) {
      toast.error(t('wallet.transfer_insufficient'));
      return;
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      await transfer(amt, transferPhone);
      toast.success(t('wallet.transfer_success', { amount: formatRupiah(amt), phone: transferPhone }));
      setModalType(null);
      setTransferPhone('');
      setTransferAmount('');
      setTransferNote('');
    } catch (err) {
      toast.error(t('wallet.transfer_failed', { message: err.message }));
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
            {t('wallet.card_label')}
          </span>
          <Sparkles size={18} className="text-amber-300 animate-pulse" />
        </div>

        <p className="text-sm opacity-90 mb-1">{t('wallet.available_balance')}</p>
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
            <span>{t('wallet.top_up')}</span>
          </button>
          <button
            onClick={() => setModalType('transfer')}
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <ArrowDownLeft size={18} className="text-amber-300" />
            <span>{t('wallet.transfer')}</span>
          </button>
          <button
            // Dimatikan sementara: pembayaran ini dulu memotong saldo tanpa
            // meneruskannya ke merchant mana pun (tidak ada penerima).
            onClick={() => toast(t('wallet.merchant_coming_soon'), { icon: '🚧' })}
            className="flex-1 opacity-60 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-3 px-2 rounded-2xl text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Building2 size={18} className="text-cyan-200" />
            <span>{t('wallet.pay_merchant')}</span>
          </button>
        </div>
      </div>

      {/* Permintaan Top-Up Menunggu Verifikasi */}
      {pendingTopUps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Clock size={16} /> {t('wallet.pending_title', { count: pendingTopUps.length })}
            </h3>
            <span className="text-[11px] text-slate-400">{t('wallet.pending_badge')}</span>
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
                        {t('wallet.pending_waiting_admin')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {t('wallet.pending_instruction', { amount: pFormatted.fullFormatted })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(p.amount, t('wallet.copy_label_amount_value', { amount: pFormatted.fullFormatted }))}
                      className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 px-2.5 py-1.5 rounded-xl transition"
                      title={t('wallet.copy_amount_title')}
                    >
                      <Copy size={13} />
                      <span>{t('common.copy')}</span>
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
                      <span>{t('wallet.view_qris')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelPending(p.id)}
                      disabled={loading}
                      className="flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-2 py-1.5 rounded-xl transition border border-rose-200/60 dark:border-rose-800/60"
                      title={t('wallet.cancel_request_title')}
                    >
                      <X size={13} />
                      <span>{t('common.cancel')}</span>
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
            {t('wallet.history_title')}
          </h3>
          <span className="text-xs text-slate-500">{t('wallet.history_count', { count: transactions.length })}</span>
        </div>

        <Card className="divide-y divide-slate-100 dark:divide-slate-800 p-0 overflow-hidden shadow-sm">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t('wallet.history_empty')}
            </div>
          ) : (
            transactions.map((trx) => {
              const shown = localizeTransaction({ type: trx.rawType, description: trx.desc }, t);
              return (
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
                      {shown.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock size={11} /> {trx.date}{shown.detail ? ` • ${shown.detail}` : ''}
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
                    {trx.status || t('wallet.transaction_success')}
                  </p>
                </div>
              </div>
              );
            })
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
                    {t('wallet.topup_title')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('wallet.topup_subtitle')}
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t('wallet.quick_amount')}
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
                      {t('wallet.other_amount')}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-slate-400 font-bold text-sm">
                        Rp
                      </span>
                      <input
                        type="number"
                        min="10000"
                        step="1000"
                        placeholder={t('wallet.min_amount_placeholder')}
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
                      {t('common.payment_method')}
                    </label>
                    {/* Single QRIS Payment Flow - VA options eliminated */}
                    <div className="p-3.5 rounded-2xl border-2 border-primary bg-primary/5 dark:bg-primary/10 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md">
                          <QrCode size={22} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {t('wallet.qris_option_title')}
                            <span className="text-[10px] bg-green-500 text-white font-semibold px-2 py-0.5 rounded-full">
                              {t('wallet.qris_option_active')}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {t('wallet.qris_option_desc')}
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
                    ? t('wallet.preparing_code')
                    : t('wallet.continue_to_qris', { amount: formatRupiah(Number(baseAmount) || 0) })}
                </Button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-900/40 text-primary mb-2 shadow-inner">
                    <QrCode size={26} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t('wallet.qris_title')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('wallet.qris_subtitle')}
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
                          {t('wallet.bill_total')}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyNominal}
                          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-cyan-700 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition shrink-0"
                          title={t('wallet.copy_amount_title')}
                        >
                          {copiedNominal ? (
                            <>
                              <Check size={13} className="text-green-600" />
                              <span className="text-green-600 font-bold">{t('common.copied')}</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>{t('wallet.copy_amount')}</span>
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
                          {t('wallet.amount_breakdown', { base: formatRupiah(Number(baseAmount)), code: `+${uniqueCode}` })}
                        </p>
                      </div>

                      {/* Info Banner when reviewing existing pending top-up */}
                      {viewingPendingId && (
                        <div className="text-center text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 py-2 px-3 rounded-xl border border-amber-300 dark:border-amber-700 flex items-center justify-center gap-1.5">
                          <Clock size={14} className="shrink-0" />
                          <span>{t('wallet.pending_status_note')}</span>
                        </div>
                      )}

                      {/* Important Warning Instruction Box */}
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex gap-2.5 text-amber-800 dark:text-amber-200 text-xs">
                        <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold">
                            {t('wallet.warning_title', { digits: formatted.uniqueDigits })}
                          </p>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                            {t('wallet.warning_body')}
                          </p>
                        </div>
                      </div>

                      {/* Step-by-Step Instructions */}
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          {t('wallet.guide_title')}
                        </p>
                        <ol className="list-decimal list-inside space-y-0.5 pl-1">
                          <li>{t('wallet.guide_step_1')}</li>
                          <li>{t('wallet.guide_step_2')}</li>
                          <li>{t('wallet.guide_step_3', { amount: formatRupiah(finalAmount) })}</li>
                          <li>{t('wallet.guide_step_4')}</li>
                        </ol>
                        <p className="text-amber-700 dark:text-amber-300">
                          {t('wallet.guide_note')}
                        </p>
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
                    {viewingPendingId ? t('wallet.new_topup') : t('wallet.change_amount')}
                  </Button>
                  <Button
                    className="flex-1 font-bold shadow-lg shadow-primary/20"
                    onClick={handleTopUpConfirm}
                    disabled={loading}
                  >
                    {loading ? t('common.processing') : viewingPendingId ? t('wallet.close_paid') : t('wallet.i_have_paid')}
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
                    <span>{t('wallet.cancel_this_request')}</span>
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
                {t('wallet.transfer_title')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t('wallet.transfer_subtitle')}
              </p>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  {t('wallet.recipient_label')}
                </label>
                <div className="relative">
                  <PhoneCall size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="tel"
                    placeholder={t('wallet.recipient_placeholder')}
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
                    {t('wallet.transfer_amount_label')}
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {t('common.balance_with_amount', { amount: formatRupiah(balance) })}
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
                    placeholder={t('wallet.transfer_amount_placeholder')}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:text-white text-base font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  {t('wallet.transfer_note_label')}
                </label>
                <input
                  type="text"
                  placeholder={t('wallet.transfer_note_placeholder')}
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
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  className="flex-1 font-bold"
                  disabled={loading || balance < Number(transferAmount)}
                >
                  {loading ? t('common.sending') : t('wallet.transfer_send')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
