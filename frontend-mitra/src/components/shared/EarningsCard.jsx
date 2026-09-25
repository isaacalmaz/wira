import React from 'react';
import { Wallet, TrendingUp } from 'lucide-react';
import { Card } from './UIComponents';

// Previously rendered a "Target Harian" (Daily Target) progress bar driven by
// a `progress` prop, but every caller passed a fake binary value
// (`value > 0 ? 100 : 0`) because there's no real daily-target feature
// anywhere in the system - it misrepresented itself as a real KPI on 5+
// screens (Driver/Merchant/Technician earnings & home pages). Removed rather
// than faked further; this now shows only real, available numbers (today's
// and this week's actual earnings).
const EarningsCard = ({ today, week }) => {
  return (
    <Card className="bg-gradient-to-br from-primary to-blue-700 text-white border-none">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-blue-100 text-sm mb-1">Pendapatan Hari Ini</p>
            <h2 className="text-3xl font-bold">Rp {today.toLocaleString('id-ID')}</h2>
          </div>
          <div className="bg-white/20 p-2 rounded-lg">
            <Wallet size={24} className="text-white" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-blue-50 bg-black/10 p-2 rounded-lg inline-flex">
          <TrendingUp size={16} className="text-green-300" />
          <span>Minggu ini: Rp {week.toLocaleString('id-ID')}</span>
        </div>
      </div>
    </Card>
  );
};
export default EarningsCard;
