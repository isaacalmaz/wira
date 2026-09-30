import { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  Copy,
  X,
  Building2,
  PhoneCall,
  Clock,
  Check,
  Plus,
  Send,
  Receipt,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconTile,
  Input,
  ListRow,
  Money,
  Notice,
  SectionHeader,
  Sheet,
  cx,
} from '../components/ui';
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

  // Display-only: which icon and tile tone a ledger row gets (DESIGN.md §5).
  // Gold (`pay`) for wallet money moves, brand for service payments,
  // danger/neutral for admin corrections.
  const ledgerVisual = (trx) => {
    switch (trx.rawType) {
      case 'topup':
        return { tone: 'pay', Icon: Plus };
      case 'transfer_in':
        return { tone: 'pay', Icon: ArrowDownLeft };
      case 'transfer':
        return { tone: 'pay', Icon: ArrowUpRight };
      case 'payment':
        return { tone: 'brand', Icon: Receipt };
      case 'refund':
        return { tone: 'brand', Icon: RotateCcw };
      case 'correction_in':
        return { tone: 'neutral', Icon: SlidersHorizontal };
      case 'correction_out':
        return { tone: 'danger', Icon: SlidersHorizontal };
      default:
        return trx.type === 'income'
          ? { tone: 'neutral', Icon: ArrowDownLeft }
          : { tone: 'neutral', Icon: ArrowUpRight };
    }
  };

  const closeTopUp = () => {
    setModalType(null);
    setViewingPendingId(null);
    setTopUpStep(1);
  };

  const topUpFormatted = formatAmountWithUniqueHighlight(finalAmount);
  const baseAmountId = 'wallet-topup-amount';
  const transferFormId = 'wallet-transfer-form';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-4">
      {/* Kartu Saldo WiraPay */}
      <section className="overflow-hidden rounded-card bg-laut-700 text-white" aria-label={t('wallet.card_label')}>
        <div className="h-2.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-5 px-5 pb-5 pt-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-laut-300">
                {t('wallet.card_label')}
              </span>
              <span className="text-[13px] text-white/70">{t('wallet.available_balance')}</span>
              <Money
                value={balance}
                className="text-[30px] font-medium leading-tight tracking-[-0.02em] text-white sm:text-[36px]"
              />
            </div>
            <Wallet size={22} className="mt-0.5 shrink-0 text-emas-400" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="on-brand"
              className="px-2"
              onClick={() => {
                setViewingPendingId(null);
                setModalType('topup');
                setTopUpStep(1);
                setBaseAmount(50000);
              }}
            >
              {t('wallet.top_up')}
            </Button>
            <Button variant="on-brand-outline" className="px-2" onClick={() => setModalType('transfer')}>
              {t('wallet.transfer')}
            </Button>
            <Button
              variant="on-brand-outline"
              className="px-2 opacity-60"
              // Dimatikan sementara: pembayaran ini dulu memotong saldo tanpa
              // meneruskannya ke merchant mana pun (tidak ada penerima).
              onClick={() => toast(t('wallet.merchant_coming_soon'), { icon: <Building2 size={18} /> })}
            >
              {t('wallet.pay_merchant')}
            </Button>
          </div>
        </div>
      </section>

      {/* Permintaan Top-Up Menunggu Verifikasi */}
      {pendingTopUps.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            className="mb-0"
            title={t('wallet.pending_title', { count: pendingTopUps.length })}
            action={<Badge tone="neutral">{t('wallet.pending_badge')}</Badge>}
          />

          <div className="flex flex-col gap-3">
            {pendingTopUps.map((p) => {
              const pFormatted = formatAmountWithUniqueHighlight(p.amount);
              return (
                <Card key={p.id} padding="none" className="border-warning-line">
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <IconTile tone="pay"><Clock size={20} /></IconTile>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="whitespace-nowrap font-mono text-[17px] font-medium tracking-tight text-ink">
                            {pFormatted.prefix}
                            <span className="text-pay-ink underline decoration-pay-line decoration-2 underline-offset-4">
                              {pFormatted.uniqueDigits}
                            </span>
                          </span>
                          <Badge tone="warning" dot>{t('wallet.pending_waiting_admin')}</Badge>
                        </div>
                        <p className="text-[12.5px] leading-relaxed text-ink-muted">
                          {t('wallet.pending_instruction', { amount: pFormatted.fullFormatted })}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
                      <Button
                        variant="danger-soft"
                        className="px-2"
                        onClick={() => handleCancelPending(p.id)}
                        disabled={loading}
                        title={t('wallet.cancel_request_title')}
                        leftIcon={<X size={15} />}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-2"
                        onClick={() => copyToClipboard(p.amount, t('wallet.copy_label_amount_value', { amount: pFormatted.fullFormatted }))}
                        title={t('wallet.copy_amount_title')}
                        leftIcon={<Copy size={15} />}
                      >
                        {t('common.copy')}
                      </Button>
                      <Button
                        className="px-2"
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
                        leftIcon={<QrCode size={15} />}
                      >
                        {t('wallet.view_qris')}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Riwayat Transaksi */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          className="mb-0"
          title={t('wallet.history_title')}
          action={<span className="font-medium text-ink-muted">{t('wallet.history_count', { count: transactions.length })}</span>}
        />

        {transactions.length === 0 ? (
          <EmptyState icon={<Wallet size={24} />} description={t('wallet.history_empty')} />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {transactions.map((trx) => {
                const shown = localizeTransaction({ type: trx.rawType, description: trx.desc }, t);
                const { tone, Icon } = ledgerVisual(trx);
                const isIncome = trx.type === 'income';
                return (
                  <li key={trx.id}>
                    <ListRow
                      className="px-4 py-3.5"
                      leading={<IconTile tone={tone} size="sm"><Icon size={17} /></IconTile>}
                      title={shown.title}
                      subtitle={
                        <>
                          <span className="font-mono">{trx.date}</span>
                          {shown.detail ? ` · ${shown.detail}` : ''}
                        </>
                      }
                      trailing={
                        <span className="flex flex-col items-end gap-0.5">
                          <Money
                            value={trx.amount}
                            sign={isIncome ? 'plus' : 'minus'}
                            tone={isIncome ? 'in' : 'default'}
                            className="text-[14px] font-medium"
                          />
                          <span className="text-[11px] text-ink-muted">
                            {trx.status || t('wallet.transaction_success')}
                          </span>
                        </span>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* MODAL 1: TOP UP SALDO */}
      <Sheet
        open={modalType === 'topup'}
        onClose={closeTopUp}
        tone="pay"
        icon={topUpStep === 1 ? <Plus size={22} /> : <QrCode size={22} />}
        title={topUpStep === 1 ? t('wallet.topup_title') : t('wallet.qris_title')}
        description={topUpStep === 1 ? t('wallet.topup_subtitle') : t('wallet.qris_subtitle')}
        closeLabel={t('common.close')}
        footer={
          topUpStep === 1 ? (
            <Button
              size="lg"
              onClick={handleProceedToPayment}
              disabled={loading || !baseAmount || Number(baseAmount) < 10000}
              isLoading={loading}
            >
              {loading
                ? t('wallet.preparing_code')
                : t('wallet.continue_to_qris', { amount: formatRupiah(Number(baseAmount) || 0) })}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setViewingPendingId(null);
                  setTopUpStep(1);
                }}
              >
                {viewingPendingId ? t('wallet.new_topup') : t('wallet.change_amount')}
              </Button>
              <Button size="lg" onClick={handleTopUpConfirm} disabled={loading} isLoading={loading}>
                {loading ? t('common.processing') : viewingPendingId ? t('wallet.close_paid') : t('wallet.i_have_paid')}
              </Button>
            </>
          )
        }
      >
        {topUpStep === 1 ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">{t('wallet.quick_amount')}</span>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((amt) => {
                  const selected = baseAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBaseAmount(amt)}
                      aria-pressed={selected}
                      className={cx(
                        'min-h-11 rounded-control border px-1.5 py-2 font-mono text-[13px] font-medium transition-colors',
                        selected
                          ? 'border-brand bg-brand-soft text-brand-ink ring-1 ring-brand'
                          : 'border-line-strong bg-card text-ink hover:bg-sunken',
                      )}
                    >
                      {formatRupiah(amt)}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label={t('wallet.other_amount')} htmlFor={baseAmountId}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-mono text-[15px] text-ink-muted">
                  Rp
                </span>
                <Input
                  id={baseAmountId}
                  type="number"
                  inputMode="numeric"
                  min="10000"
                  step="1000"
                  placeholder={t('wallet.min_amount_placeholder')}
                  value={baseAmount || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBaseAmount(val === '' ? '' : Math.max(0, Number(val)));
                  }}
                  className="pl-11 font-mono text-[17px] font-medium"
                />
              </div>
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ink">{t('common.payment_method')}</span>
              {/* Single QRIS Payment Flow - VA options eliminated */}
              <div className="flex items-center gap-3 rounded-card border-2 border-brand bg-card p-3.5">
                <IconTile tone="pay"><QrCode size={20} /></IconTile>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13.5px] font-semibold leading-snug text-ink">{t('wallet.qris_option_title')}</span>
                    <Badge tone="success">{t('wallet.qris_option_active')}</Badge>
                  </div>
                  <span className="text-[12px] text-ink-muted">{t('wallet.qris_option_desc')}</span>
                </div>
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
                  <Check size={13} strokeWidth={3} />
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Standardized QRIS Card */}
            <QRISCard />

            {/* Total Payment with Highlighted 3 Unique Digits */}
            <div className="flex flex-col gap-2 rounded-card border border-line bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  {t('wallet.bill_total')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 min-h-11"
                  onClick={handleCopyNominal}
                  title={t('wallet.copy_amount_title')}
                  leftIcon={copiedNominal ? <Check size={15} className="text-success" /> : <Copy size={15} />}
                >
                  {copiedNominal ? <span className="text-success-ink">{t('common.copied')}</span> : t('wallet.copy_amount')}
                </Button>
              </div>

              {/* Prominent nominal, last three digits called out */}
              <p className="whitespace-nowrap font-mono text-[28px] font-medium leading-tight tracking-tight text-ink">
                {topUpFormatted.prefix}
                <span className="rounded-[6px] bg-pay-soft px-1 text-pay-ink underline decoration-pay-line decoration-2 underline-offset-4">
                  {topUpFormatted.uniqueDigits}
                </span>
              </p>
              <p className="text-[12px] text-ink-muted">
                {t('wallet.amount_breakdown', { base: formatRupiah(Number(baseAmount)), code: `+${uniqueCode}` })}
              </p>
            </div>

            {/* Info banner when reviewing an existing pending top-up */}
            {viewingPendingId && (
              <Notice tone="warning">{t('wallet.pending_status_note')}</Notice>
            )}

            {/* Important Warning Instruction Box */}
            <Notice tone="warning" title={t('wallet.warning_title', { digits: topUpFormatted.uniqueDigits })}>
              {t('wallet.warning_body')}
            </Notice>

            {/* Step-by-Step Instructions */}
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-ink">{t('wallet.guide_title')}</p>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-relaxed text-ink-muted marker:font-mono marker:text-ink-muted">
                <li>{t('wallet.guide_step_1')}</li>
                <li>{t('wallet.guide_step_2')}</li>
                <li>{t('wallet.guide_step_3', { amount: formatRupiah(finalAmount) })}</li>
                <li>{t('wallet.guide_step_4')}</li>
              </ol>
              <p className="text-xs leading-relaxed text-ink-muted">{t('wallet.guide_note')}</p>
            </div>

            {viewingPendingId && (
              <Button
                variant="danger-soft"
                block
                onClick={() => handleCancelPending(viewingPendingId)}
                disabled={loading}
                leftIcon={<X size={16} />}
              >
                {t('wallet.cancel_this_request')}
              </Button>
            )}
          </div>
        )}
      </Sheet>

      {/* MODAL 2: TRANSFER ANTAR USER */}
      <Sheet
        open={modalType === 'transfer'}
        onClose={() => setModalType(null)}
        tone="pay"
        icon={<Send size={20} />}
        title={t('wallet.transfer_title')}
        description={t('wallet.transfer_subtitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setModalType(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form={transferFormId}
              size="lg"
              disabled={loading || balance < Number(transferAmount)}
              isLoading={loading}
            >
              {loading ? t('common.sending') : t('wallet.transfer_send')}
            </Button>
          </>
        }
      >
        <form id={transferFormId} onSubmit={handleTransferSubmit} className="flex flex-col gap-4">
          <Field label={t('wallet.recipient_label')} htmlFor="wallet-transfer-phone">
            <div className="relative">
              <PhoneCall size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input
                id="wallet-transfer-phone"
                type="tel"
                inputMode="tel"
                placeholder={t('wallet.recipient_placeholder')}
                value={transferPhone}
                onChange={(e) => setTransferPhone(e.target.value)}
                className="pl-10 font-mono"
                required
              />
            </div>
          </Field>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <label htmlFor="wallet-transfer-amount" className="text-[13px] font-semibold text-ink">
                {t('wallet.transfer_amount_label')}
              </label>
              <span className="text-xs text-ink-muted">
                {t('common.balance_with_amount', { amount: formatRupiah(balance) })}
              </span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-mono text-[15px] text-ink-muted">
                Rp
              </span>
              <Input
                id="wallet-transfer-amount"
                type="number"
                inputMode="numeric"
                min="5000"
                max={balance}
                placeholder={t('wallet.transfer_amount_placeholder')}
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="pl-11 font-mono text-[17px] font-medium"
                required
              />
            </div>
          </div>

          <Field label={t('wallet.transfer_note_label')} htmlFor="wallet-transfer-note">
            <Input
              id="wallet-transfer-note"
              type="text"
              placeholder={t('wallet.transfer_note_placeholder')}
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
            />
          </Field>
        </form>
      </Sheet>
    </div>
  );
}
