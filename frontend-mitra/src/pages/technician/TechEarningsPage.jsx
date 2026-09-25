import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { technicianEarnedAmount, cashCommissionDeduction } from '../../services/orderService';

// Matches TechOrdersPage.jsx/TechHomePage.jsx's real filter list - previously
// this page only queried service_type 'service', silently excluding 'pool'
// (and the WiraService/WiraPool variants) from a technician's own earnings
// totals even though Home/Orders correctly include them.
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];

const TechEarningsPage = () => {
  const { user } = useAuth();
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [cashDeduction, setCashDeduction] = useState(0);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('total_price, payment_method, created_at')
        .eq('driver_id', user.id)
        .in('service_type', TECHNICIAN_SERVICE_TYPES)
        .eq('status', 'completed');

      if (data) {
        let tSum = 0;
        let wSum = 0;
        let cashSum = 0;
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
          // Real technician share (80%, matching driver/merchant), not raw
          // total_price - see technicianEarnedAmount's doc comment.
          const price = technicianEarnedAmount(o);

          if (oDateStr === todayStr) tSum += price;
          wSum += price;
          cashSum += cashCommissionDeduction(o, 'driver');

          const dayEntry = weekDays.find(w => w.dateStr === oDateStr);
          if (dayEntry) dayEntry.amount += price;
        });

        setTodayTotal(tSum);
        setWeekTotal(wSum);
        setCashDeduction(cashSum);
        setChartData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pendapatan Teknisi</h1>
      <EarningsCard today={todayTotal} week={weekTotal} cashDeduction={cashDeduction} />

      <Card className="p-4 h-72">
        <h3 className="font-semibold mb-4 text-slate-700 dark:text-slate-300">Grafik Mingguan (7 Hari Terakhir)</h3>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={chartData}>
            <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v/1000}k`} />
            <Tooltip formatter={(v) => `Rp ${v.toLocaleString()}`} />
            <Bar dataKey="amount" fill="#D97706" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <PayoutPanel />
    </div>
  );
};
export default TechEarningsPage;
