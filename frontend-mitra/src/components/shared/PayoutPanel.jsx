import { useState, useEffect, useCallback } from 'react';
import { Wallet, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Button, Card, Field, IconTile, Input, Money, Notice, Select, Sheet } from '../ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const STATUS_LABEL = {
  pending: { text: 'Menunggu diproses admin', icon: Clock, tone: 'warning' },
  approved: { text: 'Sudah ditransfer', icon: CheckCircle2, tone: 'success' },
  rejected: { text: 'Ditolak', icon: XCircle, tone: 'danger' },
  cancelled: { text: 'Dibatalkan', icon: XCircle, tone: 'neutral' },
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

  const refresh = useCallback(async () => {
    if (!user) return;
    const [{ data: userRow }, { data: reqRows }] = await Promise.all([
      supabase.from('users').select('payable_balance').eq('id', user.id).single(),
      supabase.from('payout_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    ]);
    if (userRow) setBalance(Number(userRow.payable_balance) || 0);
    if (reqRows) setRequests(reqRows);
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
      toast.error(err.message || 'Gagal mengajukan pencairan');
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
      toast.error(err.message || 'Gagal membatalkan permintaan');
    }
  };

  const maxAmount = Math.floor(balance);

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Saldo Bisa Dicairkan</p>
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
            Saldo minus karena komisi tunai (dipotong dari saldo): pada order Tunai uang dari pelanggan sudah Anda terima langsung, jadi komisi Wira ditagih dari saldo ini. Kekurangan ini tertutup otomatis dari pendapatan order non-tunai berikutnya. Tarik saldo belum bisa dilakukan sampai saldo kembali positif.
          </Notice>
        )}
        {balance === 0 && (
          <p className="text-[13px] text-ink-muted">Belum ada saldo yang bisa dicairkan.</p>
        )}

        <Button variant="primary" size="lg" block onClick={() => setModalOpen(true)} disabled={balance <= 0}>
          Tarik Saldo
        </Button>
      </div>

      {requests.length > 0 && (
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
    </Card>
  );
}
