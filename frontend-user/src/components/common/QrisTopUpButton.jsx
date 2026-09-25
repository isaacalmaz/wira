import { useNavigate, useLocation } from 'react-router-dom';
import { formatRupiah } from '../../utils/formatRupiah';

const MIN_TOPUP = 10000;

// Replaces the old "Transfer Bank" option on Pool/Villa: bank transfers had
// no verified recipient and no confirmation, so the mitra was credited even
// if the customer never paid. Instead the customer tops up WiraPay via the
// static QRIS (auto-verified by the Mutasiku webhook) and then pays the
// order with WiraPay (create_order_and_pay, migrations/0070).
export default function QrisTopUpButton({ price, balance }) {
  const navigate = useNavigate();
  const location = useLocation();
  const shortfall = Math.max(0, Number(price || 0) - Number(balance || 0));
  const topupAmount = Math.max(MIN_TOPUP, Math.ceil(shortfall / 1000) * 1000);

  return (
    <button
      type="button"
      onClick={() =>
        navigate('/wallet', { state: { topupAmount, returnTo: location.pathname } })
      }
      className="p-2.5 rounded-xl border text-left text-xs transition border-slate-200 dark:border-slate-700 hover:border-primary"
    >
      <p className="font-bold text-slate-900 dark:text-white">QRIS</p>
      <p className="text-[10px] text-slate-500">
        {shortfall > 0 ? `Isi saldo ${formatRupiah(topupAmount)}, lalu bayar` : 'Isi saldo WiraPay via QRIS'}
      </p>
    </button>
  );
}
