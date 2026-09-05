import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { dailyEarnings, weeklyEarnings } from '../../data/earnings';
import { Card, Button } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';

const DriverEarningsPage = () => {
  const [tab, setTab] = useState('daily');
  const data = tab === 'daily' ? dailyEarnings : weeklyEarnings;
  const dataKey = tab === 'daily' ? 'day' : 'week';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pendapatan</h1>
      
      <EarningsCard today={150000} week={850000} progress={100} />

      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
        {['daily', 'weekly'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm font-medium rounded-md capitalize ${tab === t ? 'bg-white dark:bg-slate-800 shadow text-primary' : 'text-slate-500'}`}>
            {t === 'daily' ? 'Harian' : 'Mingguan'}
          </button>
        ))}
      </div>

      <Card className="p-4 h-72">
        <h3 className="font-semibold mb-4 text-slate-700 dark:text-slate-300">Grafik Pendapatan</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey={dataKey} stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `${value/1000}k`} />
            <Tooltip formatter={(val) => `Rp ${val.toLocaleString()}`} />
            <Bar dataKey="amount" fill="#0891B2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Button variant="primary" className="w-full py-3">Tarik Saldo (Withdraw)</Button>
    </div>
  );
};
export default DriverEarningsPage;
