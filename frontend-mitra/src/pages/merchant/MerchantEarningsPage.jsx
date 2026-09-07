import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

const MerchantEarningsPage = () => {
  const { user } = useAuth();
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('total_price, created_at, title')
        .eq('service_type', 'food')
        .eq('status', 'completed');

      if (data) {
        let todaySum = 0;
        let weekSum = 0;
        const now = new Date();
        const todayStr = now.toLocaleDateString('id-ID');

        const daysMap = { 0: 'Min', 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab' };
        const weekDays = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(now.getDate() - i);
          weekDays.push({
            dateStr: d.toLocaleDateString('id-ID'),
            day: daysMap[d.getDay()],
            amount: 0
          });
        }

        data.forEach(o => {
          const oDate = new Date(o.created_at);
          const oDateStr = oDate.toLocaleDateString('id-ID');
          const amount = o.total_price || 0;

          if (oDateStr === todayStr) todaySum += amount;
          weekSum += amount;

          const dayEntry = weekDays.find(w => w.dateStr === oDateStr);
          if (dayEntry) dayEntry.amount += amount;
        });

        setTodayTotal(todaySum);
        setWeekTotal(weekSum);
        setChartData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pendapatan Resto</h1>
      <EarningsCard today={todayTotal} week={weekTotal} progress={weekTotal > 0 ? 100 : 0} />

      <Card className="p-4 h-72">
        <h3 className="font-semibold mb-4">Tren Pendapatan (7 Hari Terakhir)</h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={chartData}>
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val/1000}k`} />
            <Tooltip formatter={(val) => `Rp ${val.toLocaleString()}`} />
            <Line type="monotone" dataKey="amount" stroke="#F97316" strokeWidth={3} dot={{r: 4}} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};
export default MerchantEarningsPage;
