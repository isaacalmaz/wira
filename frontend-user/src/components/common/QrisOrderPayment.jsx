import { useEffect, useState } from 'react';
import { Copy, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import QRISCard from './QRISCard';
import { supabase } from '../../config/supabase';
import { formatAmountWithUniqueHighlight } from '../../services/topupService';

// Must match expire_awaiting_qris_orders() in migrations/0078.
const PAY_WINDOW_MS = 15 * 60 * 1000;

// Payment screen for an order created with "QRIS" (status 'awaiting_payment',
// migrations/0077). The exact nominal comes from the order's linked
// topup_requests row; the Mutasiku webhook verifies the transfer and the DB
// moves the order on to 'pending', which ActiveOrderPage picks up.
export default function QrisOrderPayment({ order, onCancel, cancelling }) {
  const [amount, setAmount] = useState(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('topup_requests')
      .select('amount')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setAmount(Number(data.amount));
      });
    return () => { cancelled = true; };
  }, [order.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = Math.max(0, new Date(order.created_at).getTime() + PAY_WINDOW_MS - now);
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
  const formatted = amount ? formatAmountWithUniqueHighlight(amount) : null;
  const uniqueCode = amount ? amount - Number(order.total_price || 0) : 0;

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(String(amount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Gagal menyalin nominal');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 shrink-0 shadow-sm mb-2 border-b dark:border-slate-700 space-y-3 text-center">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Bayar dengan QRIS</p>
      <QRISCard />
      {formatted ? (
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {formatted.prefix}
            <span className="text-primary">{formatted.uniqueDigits}</span>
          </span>
          <button type="button" onClick={copyAmount} className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-700">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Memuat nominal...</p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Bayar <b>tepat</b> sesuai nominal, termasuk 3 digit terakhir, agar terverifikasi otomatis.
        {uniqueCode > 0 && ` Kelebihan Rp ${uniqueCode.toLocaleString('id-ID')} masuk ke saldo WiraPay Anda.`}
      </p>
      <p className={`text-xs font-semibold inline-flex items-center gap-1 ${remainingMs > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
        <Clock size={14} />
        {remainingMs > 0 ? `Selesaikan pembayaran dalam ${mm}:${ss}` : 'Waktu pembayaran habis, pesanan akan dibatalkan otomatis.'}
      </p>
      <p className="text-[11px] text-slate-500">
        Pesanan diteruskan ke mitra setelah pembayaran terverifikasi (biasanya 1-2 menit).
        Jika Anda membayar setelah waktu habis, dana masuk ke saldo WiraPay.
      </p>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        className="w-full bg-red-50 text-red-600 py-2.5 rounded-xl font-bold border border-red-200 text-sm"
      >
        {cancelling ? 'Membatalkan...' : 'Batalkan Pesanan'}
      </button>
    </div>
  );
}
