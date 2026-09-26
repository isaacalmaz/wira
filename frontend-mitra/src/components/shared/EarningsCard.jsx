import { Wallet, TrendingUp, Banknote } from 'lucide-react';
import { Card } from './UIComponents';
import { formatSignedRupiah } from '../../utils/formatters';

// Previously rendered a "Target Harian" (Daily Target) progress bar driven by
// a `progress` prop, but every caller passed a fake binary value
// (`value > 0 ? 100 : 0`) because there's no real daily-target feature
// anywhere in the system - it misrepresented itself as a real KPI on 5+
// screens (Driver/Merchant/Technician earnings & home pages). Removed rather
// than faked further; this now shows only real, available numbers (today's
// and this week's actual earnings).
// `cashDeduction` (optional): what Tunai orders took back out of the saldo
// (migrations/0075) over the same orders `week` covers; today/week are the
// net saldo change and can be negative.
const EarningsCard = ({ today, week, cashDeduction = 0 }) => {
  return (
    <Card className="bg-gradient-to-br from-primary to-blue-700 text-white border-none">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-blue-100 text-sm mb-1">Pendapatan Hari Ini</p>
            <h2 className="text-3xl font-bold">{formatSignedRupiah(today)}</h2>
          </div>
          <div className="bg-white/20 p-2 rounded-lg">
            <Wallet size={24} className="text-white" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-blue-50 bg-black/10 p-2 rounded-lg inline-flex">
          <TrendingUp size={16} className="text-green-300" />
          <span>Minggu ini: {formatSignedRupiah(week)}</span>
        </div>

        {cashDeduction > 0 && (
          <div className="mt-3 text-sm bg-black/10 p-2 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Banknote size={16} className="text-amber-200" /> Komisi tunai (dipotong dari saldo)</span>
              <span className="font-semibold text-amber-200">{formatSignedRupiah(-cashDeduction)}</span>
            </div>
            <p className="text-xs text-blue-100 mt-1">Order Tunai: uang dari pelanggan sudah Anda terima langsung, jadi komisi Wira (dan bagian resto untuk WiraFood yang Anda antar) dipotong dari saldo. Sudah termasuk dalam angka di atas.</p>
          </div>
        )}
      </div>
    </Card>
  );
};
export default EarningsCard;
