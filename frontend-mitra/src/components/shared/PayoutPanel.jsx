import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Card, Button, Modal } from './UIComponents';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { formatSignedRupiah } from '../../utils/formatters';

const STATUS_LABEL = {
  pending: { text: 'Menunggu diproses admin', icon: Clock, cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
  approved: { text: 'Sudah ditransfer', icon: CheckCircle2, cls: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' },
  rejected: { text: 'Ditolak', icon: XCircle, cls: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' },
  cancelled: { text: 'Dibatalkan', icon: XCircle, cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
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

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
          <Wallet size={16} /> Saldo Bisa Dicairkan
        </div>
      </div>
      <p className={`text-2xl font-bold mb-3 ${balance < 0 ? 'text-red-600' : ''}`}>{formatSignedRupiah(Math.floor(balance))}</p>
      {balance < 0 && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg p-2 mb-3">
          Saldo minus karena komisi tunai (dipotong dari saldo): pada order Tunai uang dari pelanggan sudah Anda terima langsung, jadi komisi Wira ditagih dari saldo ini. Kekurangan ini tertutup otomatis dari pendapatan order non-tunai berikutnya. Tarik saldo belum bisa dilakukan sampai saldo kembali positif.
        </p>
      )}
      {balance === 0 && (
        <p className="text-xs text-slate-500 mb-3">Belum ada saldo yang bisa dicairkan.</p>
      )}
      <Button variant="primary" className="w-full py-3" onClick={() => setModalOpen(true)} disabled={balance <= 0}>
        Tarik Saldo
      </Button>

      {requests.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Riwayat Pencairan</p>
          {requests.map((r) => {
            const s = STATUS_LABEL[r.status] || STATUS_LABEL.pending;
            const Icon = s.icon;
            return (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5">
                <div>
                  <p className="font-medium">Rp {Number(r.amount).toLocaleString('id-ID')}</p>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-0.5 ${s.cls}`}>
                    <Icon size={12} /> {s.text}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <button onClick={() => handleCancel(r.id)} className="text-xs text-red-500 hover:underline">Batalkan</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-sm p-5 relative">
            <button onClick={() => setModalOpen(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h3 className="font-bold text-lg mb-4">Tarik Saldo</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nominal (maks. Rp {Math.floor(balance).toLocaleString('id-ID')})</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Contoh: 100000"
                  min="1"
                  max={Math.floor(balance)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Metode</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="bank_transfer">Transfer Bank</option>
                  <option value="ewallet">E-Wallet (DANA/OVO/GoPay)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nomor Rekening / E-Wallet</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Contoh: BCA 1234567890"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nama Pemilik Rekening</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Sesuai buku tabungan/akun"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full py-2.5" disabled={submitting}>
                {submitting ? 'Mengirim...' : 'Ajukan Pencairan'}
              </Button>
            </form>
      </Modal>
    </Card>
  );
}
