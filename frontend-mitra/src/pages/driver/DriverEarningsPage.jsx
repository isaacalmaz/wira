import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Button } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

const DriverEarningsPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState('daily');
  const [earningsData, setEarningsData] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  
  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('total_price, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'completed');
        
      if (data) {
        let totalToday = 0;
        let totalWeek = 0;
        const now = new Date();
        const todayStr = now.toLocaleDateString('id-ID');
        
        // Buat rentang 7 hari terakhir secara riil
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

        data.forEach(order => {
          const orderDate = new Date(order.created_at);
          const orderDateStr = orderDate.toLocaleDateString('id-ID');
          const price = order.total_price || 0;
          
          if (orderDateStr === todayStr) {
            totalToday += price;
          }
          totalWeek += price;

          const foundDay = weekDays.find(w => w.dateStr === orderDateStr);
          if (foundDay) {
            foundDay.amount += price;
          }
        });

        setTodayTotal(totalToday);
        setWeekTotal(totalWeek);
        setEarningsData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold">Pendapatan</h1>
      
      <EarningsCard today={todayTotal} week={weekTotal} progress={weekTotal > 0 ? 100 : 0} />

      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
        <button className="flex-1 py-2 text-sm font-medium rounded-md capitalize bg-white dark:bg-slate-800 shadow text-primary">Harian</button>
      </div>

      <Card className="p-4 h-72">
        <h3 className="font-semibold mb-4 text-slate-700 dark:text-slate-300">Grafik Pendapatan</h3>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={earningsData}>
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
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
