import React from 'react';
import { Wallet, TrendingUp } from 'lucide-react';
import { Card } from './UIComponents';

const EarningsCard = ({ today, week, progress = 75 }) => {
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
        
        <div className="mb-4">
          <div className="flex justify-between text-xs text-blue-100 mb-1">
            <span>Target Harian</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-black/20 rounded-full h-2">
            <div className="bg-secondary h-2 rounded-full" style={{ width: `${progress}%` }}></div>
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
