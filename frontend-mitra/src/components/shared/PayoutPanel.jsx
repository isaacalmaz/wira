import { useState, useEffect, useCallback } from 'react';
import { Wallet, Clock, CheckCircle2, XCircle, HandCoins, Camera } from 'lucide-react';
import { Badge, Button, Card, Field, IconTile, Input, Money, Notice, Select, Sheet } from '../ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import qrisImg from '../../assets/qris-wira.jpeg';
import { friendlyError } from '../../utils/friendlyError';
import { WALLET_ENABLED } from '../../config/wallet';

const STATUS_LABEL = {
  pending: { text: 'Menunggu diproses admin', icon: Clock, tone: 'warning' },
  approved: { text: 'Sudah ditransfer', icon: CheckCircle2, tone: 'success' },
  rejected: { text: 'Ditolak', icon: XCircle, tone: 'danger' },
  cancelled: { text: 'Dibatalkan', icon: XCircle, tone: 'neutral' },
};

const DEPOSIT_STATUS = {
  pending: { text: 'Menunggu dicek admin', icon: Clock, tone: 'warning' },
  approved: { text: 'Diterima', icon: CheckCircle2, tone: 'success' },
  rejected: { text: 'Ditolak', icon: XCircle, tone: 'danger' },
};

const settingValue = (rows, key, fallback) => {
  const row = rows?.find((r) => r.key === key);
  return row ? row.value : fallback;
};

/**
 * Shared "Tarik Saldo" panel for driver/merchant/technician earnings pages.
 * Shows the real, server-tracked payable_balance (credited automatically
 * when an order completes - see migrations/0028), lets the mitra request a
 * withdrawal, and lists their past requests. Payout is manual: admin sends
 * the money externally and marks the request approved, same as top-up in
 * reverse - there's no payment-gateway integration to automate this.
 * Since migrations/0075 the balance can be negative: a Tunai order debits
 * the platform commission from it, and request_payout refuses any amount
 * above the balance, so withdrawal stays unavailable until it's positive.
 * Since migrations/0109 the commission owed is paid with "Setor Komisi":
 * the partner transfers to Wira, attaches the proof, an admin approves and
 * the amount is added to the balance. Paying ahead works as a deposit.
 */
export default function PayoutPanel() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [requests, setRequests] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [destination, setDestination] = useState('');
  const [accountName, setAccountName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [debtSince, setDebtSince] = useState(null);
  const [settings, setSettings] = useState({ info: '', limit: 200000, grace: 7 });
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [depositing, setDepositing] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [{ data: userRow }, { data: reqRows }, { data: depRows }, { data: settingRows }] = await Promise.all([
      supabase.from('users').select('payable_balance, commission_debt_since').eq('id', user.id).single(),
      supabase.from('payout_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('commission_deposits').select('id, amount, status, reject_reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('app_settings').select('key, value').in('key', ['commission_payment_info', 'commission_debt_limit', 'commission_debt_grace_days']),
    ]);
    if (userRow) {
      setBalance(Number(userRow.payable_balance) || 0);
      setDebtSince(userRow.commission_debt_since || null);
    }
    if (reqRows) setRequests(reqRows);
    if (depRows) setDeposits(depRows);
    if (settingRows) {
      setSettings({
        info: settingValue(settingRows, 'commission_payment_info', ''),
        limit: Number(settingValue(settingRows, 'commission_debt_limit', 200000)),
        grace: Number(settingValue(settingRows, 'commission_debt_grace_days', 7)),
      });
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (numAmount > balance) {
      toast.error('Nominal melebihi saldo yang bisa dicairkan');
      return;
    }
    if (!destination.trim()) {
      toast.error('Nomor rekening/e-wallet wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('request_payout', {
        p_amount: numAmount,
        p_payout_method: method,
        p_payout_destination: destination.trim(),
        p_payout_account_name: accountName.trim() || null,
      });
      if (error) throw error;
      toast.success('Permintaan pencairan terkirim, menunggu diproses admin');
      setModalOpen(false);
      setAmount('');
      setDestination('');
      setAccountName('');
      refresh();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengajukan pencairan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      const { data, error } = await supabase.rpc('cancel_payout_request', { request_id: id });
      if (error || data !== true) throw error || new Error('Gagal membatalkan');
      toast.success('Permintaan dibatalkan, saldo dikembalikan');
      refresh();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal membatalkan permintaan');
    }
  };

  const openDeposit = () => {
    setDepositAmount(balance < 0 ? String(Math.ceil(-balance)) : '');
    setDepositOpen(true);
  };

  const pickProof = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Pilih foto bukti transfer (gambar)');
      return;
    }
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const numAmount = Math.round(Number(depositAmount));
    if (!numAmount || numAmount < 10000) {
      toast.error('Setoran minimal Rp 10.000');
      return;
    }
    if (!proofFile) {
      toast.error('Lampirkan foto bukti transfer');
      return;
    }
    setDepositing(true);
    try {
      const ext = (proofFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('commission-proofs').upload(path, proofFile, {
        contentType: proofFile.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error } = await supabase.rpc('submit_commission_deposit', {
        p_amount: numAmount,
        p_proof_path: path,
        p_note: depositNote.trim() || null,
      });
      if (error) throw error;
      toast.success('Setoran terkirim. Saldo bertambah setelah admin mengecek transfer Anda.');
      setDepositOpen(false);
      setDepositAmount('');
      setDepositNote('');
      setProofFile(null);
      setProofPreview(null);
      refresh();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengirim setoran');
    } finally {
      setDepositing(false);
    }
  };

  const maxAmount = Math.floor(balance);
  const debtDays = debtSince ? Math.floor((Date.now() - new Date(debtSince).getTime()) / 86400000) : 0;
  const blocked = balance <= -settings.limit && debtDays > settings.grace;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{WALLET_ENABLED ? 'Saldo Bisa Dicairkan' : 'Saldo Anda di Wira'}</p>
            <Money
              value={maxAmount}
              sign={balance < 0 ? 'minus' : undefined}
              className={`text-[26px] font-medium leading-none tracking-tight ${balance < 0 ? 'text-danger' : 'text-ink'}`}
            />
          </div>
          <IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>
        </div>

        {balance < 0 && (
          <Notice tone="danger">
            {blocked ? (
              <>Anda belum bisa menerima pesanan baru: komisi belum disetor lebih dari {settings.grace} hari. Setor sekarang, pesanan terbuka lagi setelah admin mengecek transfer Anda.</>
            ) : (
              <>Ini komisi Wira dari pesanan tunai, yang uangnya sudah Anda terima langsung. Setor lewat tombol di bawah. Kalau utang mencapai <Money value={settings.limit} className="font-medium" /> lebih dari {settings.grace} hari, Anda tidak bisa menerima pesanan baru.</>
            )}
          </Notice>
        )}
        {balance === 0 && (
          <p className="text-[13px] text-ink-muted">{WALLET_ENABLED ? 'Belum ada saldo yang bisa dicairkan.' : 'Tidak ada komisi yang perlu disetor.'}</p>
        )}
        {!WALLET_ENABLED && balance > 0 && (
          <p className="text-[13px] leading-relaxed text-ink-muted">Saldo positif dibayarkan Wira ke rekening Anda. Hubungi admin lewat Pusat Bantuan untuk jadwal pembayarannya.</p>
        )}

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button variant={balance < 0 ? 'primary' : 'secondary'} size="lg" block onClick={openDeposit}>
            Setor Komisi
          </Button>
          {WALLET_ENABLED && (
            <Button variant={balance < 0 ? 'secondary' : 'primary'} size="lg" block onClick={() => setModalOpen(true)} disabled={balance <= 0}>
              Tarik Saldo
            </Button>
          )}
        </div>
      </div>

      {deposits.length > 0 && (
        <div className="border-t border-line">
          <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted sm:px-5">Riwayat Setoran Komisi</p>
          <ul className="flex flex-col">
            {deposits.map((d) => {
              const s = DEPOSIT_STATUS[d.status] || DEPOSIT_STATUS.pending;
              const Icon = s.icon;
              return (
                <li key={d.id} className="flex flex-col items-start gap-1.5 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                  <Money value={d.amount} className="text-[14px] font-medium text-ink" />
                  <Badge tone={s.tone}>
                    <Icon size={12} aria-hidden="true" /> {s.text}
                  </Badge>
                  {d.status === 'rejected' && d.reject_reason && (
                    <p className="text-[12.5px] text-ink-muted">Alasan: {d.reject_reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {WALLET_ENABLED && requests.length > 0 && (
        <div className="border-t border-line">
          <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted sm:px-5">Riwayat Pencairan</p>
          <ul className="flex flex-col">
            {requests.map((r) => {
              const s = STATUS_LABEL[r.status] || STATUS_LABEL.pending;
              const Icon = s.icon;
              return (
                <li key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                    <Money value={r.amount} className="text-[14px] font-medium text-ink" />
                    <Badge tone={s.tone}>
                      <Icon size={12} aria-hidden="true" /> {s.text}
                    </Badge>
                  </div>
                  {r.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleCancel(r.id)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-[13px] font-semibold text-danger-ink transition-colors hover:bg-danger-soft"
                    >
                      Batalkan
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tarik Saldo"
        icon={<Wallet size={22} />}
        tone="pay"
        size="sm"
        footer={(
          <Button type="submit" form="payout-form" variant="primary" size="lg" isLoading={submitting}>
            {submitting ? 'Mengirim...' : 'Ajukan Pencairan'}
          </Button>
        )}
      >
        <form id="payout-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            label={<>Nominal (maks. <Money value={maxAmount} className="font-medium" />)</>}
            htmlFor="payout-amount"
          >
            <Input
              id="payout-amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
              placeholder="Contoh: 100000"
              min="1"
              max={maxAmount}
              required
            />
          </Field>
          <Field label="Metode" htmlFor="payout-method">
            <Select
              id="payout-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="bank_transfer">Transfer Bank</option>
              <option value="ewallet">E-Wallet (DANA/OVO/GoPay)</option>
            </Select>
          </Field>
          <Field label="Nomor Rekening / E-Wallet" htmlFor="payout-destination">
            <Input
              id="payout-destination"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="font-mono"
              placeholder="Contoh: BCA 1234567890"
              required
            />
          </Field>
          <Field label="Nama Pemilik Rekening" htmlFor="payout-account-name">
            <Input
              id="payout-account-name"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Sesuai buku tabungan/akun"
            />
          </Field>
        </form>
      </Sheet>

      <Sheet
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title="Setor Komisi"
        icon={<HandCoins size={22} />}
        tone="pay"
        size="sm"
        footer={(
          <Button type="submit" form="deposit-form" variant="primary" size="lg" isLoading={depositing}>
            {depositing ? 'Mengirim...' : 'Kirim Bukti Setoran'}
          </Button>
        )}
      >
        <form id="deposit-form" onSubmit={handleDeposit} className="flex flex-col gap-4">
          <p data-autofocus tabIndex={-1} className="text-[13px] leading-relaxed text-ink-muted outline-none">
            Bayar komisi lewat QRIS atau transfer, lalu kirim fotonya di sini.
          </p>
          <Field
            label={balance < 0 ? <>Nominal (komisi Anda <Money value={Math.ceil(-balance)} className="font-medium" />)</> : 'Nominal deposit'}
            htmlFor="deposit-amount"
          >
            <Input
              id="deposit-amount"
              type="number"
              inputMode="numeric"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="font-mono"
              placeholder="Contoh: 50000"
              min="10000"
              required
            />
          </Field>
          <Notice tone="info">
            <span className="whitespace-pre-line">{settings.info || 'Scan QRIS Wira, lalu lampirkan bukti pembayarannya.'}</span>
          </Notice>
          {/BCA\s+(\d{6,})/i.test(settings.info || '') && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const no = (settings.info.match(/BCA\s+(\d{6,})/i) || [])[1];
                navigator.clipboard?.writeText(no).then(() => toast.success('Nomor rekening disalin'), () => toast.error('Salin manual: ' + no));
              }}
            >
              Salin nomor rekening BCA
            </Button>
          )}
          <details className="rounded-control border border-line bg-card">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13.5px] font-semibold text-ink">Tampilkan QRIS Wira</summary>
            <div className="flex flex-col items-center gap-3 border-t border-line bg-[#ffffff] p-3">
              <img src={qrisImg} alt="QRIS Wira" className="w-full max-w-[260px] rounded-[8px]" />
            </div>
            <div className="border-t border-line p-3">
              {/* In the Android app a link to another site opens the phone's
                  browser, where the image can be saved and then scanned from
                  the gallery in m-banking/e-wallet apps. */}
              <a
                href="https://wira.one/qris-wira.jpeg"
                target="_blank"
                rel="noreferrer"
                download="qris-wira.jpeg"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line-strong px-4 text-[13.5px] font-semibold text-ink hover:bg-sunken"
              >
                Buka gambar QRIS untuk disimpan
              </a>
            </div>
          </details>
          <Field label="Foto bukti transfer" htmlFor="deposit-proof">
            <label
              htmlFor="deposit-proof"
              className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-control border border-dashed border-line-strong bg-ground px-3 py-4 text-center hover:bg-sunken"
            >
              {proofPreview ? (
                <img src={proofPreview} alt="Bukti transfer" className="max-h-48 w-auto rounded-[8px] object-contain" />
              ) : (
                <>
                  <Camera size={20} className="text-brand-ink" aria-hidden="true" />
                  <span className="text-[13px] font-semibold text-ink">Pilih foto</span>
                  <span className="text-[11px] text-ink-muted">Screenshot atau foto struk transfer</span>
                </>
              )}
            </label>
            <input id="deposit-proof" type="file" accept="image/*" className="sr-only" onChange={pickProof} />
          </Field>
          <Field label="Catatan (opsional)" htmlFor="deposit-note">
            <Input
              id="deposit-note"
              type="text"
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              placeholder="Contoh: transfer BCA a.n. Budi"
            />
          </Field>
        </form>
      </Sheet>
    </Card>
  );
}
