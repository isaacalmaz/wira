import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { dailyEarnings } from '../../data/earnings';
import { Card } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';

const MerchantEarningsPage = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pendapatan Resto</h1>
      <EarningsCard today={1250000} week={8500000} progress={85} />

      <Card className="p-4 h-72">
        <h3 className="font-semibold mb-4">Tren Pendapatan</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dailyEarnings}>
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val/1000}k`} />
            <Tooltip formatter={(val) => `Rp ${val.toLocaleString()}`} />
            <Line type="monotone" dataKey="amount" stroke="#F97316" strokeWidth={3} dot={{r: 4}} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div>
        <h3 className="font-bold mb-3">Menu Terlaris (Bulan Ini)</h3>
        <Card className="p-0 divide-y divide-slate-100 dark:divide-slate-700">
          {[
            { name: 'Ayam Taliwang', qty: 145, rev: 6525000 },
            { name: 'Sate Bulayak', qty: 98, rev: 3430000 },
            { name: 'Es Jeruk', qty: 210, rev: 2100000 }
          ].map((item, i) => (
            <div key={i} className="p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-slate-500">Terjual: {item.qty}</p>
              </div>
              <p className="font-bold text-primary">Rp {item.rev.toLocaleString()}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};
export default MerchantEarningsPage;
