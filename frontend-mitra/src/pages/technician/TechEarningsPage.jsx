import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { weeklyEarnings } from '../../data/earnings';
import { Card } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';

const TechEarningsPage = () => (
  <div className="space-y-6">
    <h1 className="text-2xl font-bold">Pendapatan Teknisi</h1>
    <EarningsCard today={450000} week={2100000} progress={90} />

    <Card className="p-4 h-72">
      <h3 className="font-semibold mb-4 text-slate-700">Grafik Mingguan</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeklyEarnings}>
          <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v/1000}k`} />
          <Tooltip formatter={(v) => `Rp ${v.toLocaleString()}`} />
          <Bar dataKey="amount" fill="#D97706" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  </div>
);
export default TechEarningsPage;
