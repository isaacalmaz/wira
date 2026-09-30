import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, PageHeader, SectionHeader } from '../../components/ui';
import EarningsCard from '../../components/shared/EarningsCard';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { merchantEarnedAmount, cashCommissionDeduction } from '../../services/orderService';

const MerchantEarningsPage = () => {
  const { user } = useAuth();
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [cashDeduction, setCashDeduction] = useState(0);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .single();

      if (!merchantData) return;

      const { data } = await supabase
        .from('orders')
        .select('total_price, delivery_fee, payment_method, driver_id, created_at, title')
        .eq('merchant_id', merchantData.id)
        .eq('status', 'completed');

      if (data) {
        let todaySum = 0;
        let weekSum = 0;
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
          // Real merchant share per migrations/0028's payout trigger, not
          // raw total_price - see merchantEarnedAmount's doc comment.
          const amount = merchantEarnedAmount(o);

          if (oDateStr === todayStr) todaySum += amount;
          weekSum += amount;
          cashSum += cashCommissionDeduction(o, 'merchant');

          const dayEntry = weekDays.find(w => w.dateStr === oDateStr);
          if (dayEntry) dayEntry.amount += amount;
        });

        setTodayTotal(todaySum);
        setWeekTotal(weekSum);
        setCashDeduction(cashSum);
        setChartData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Pendapatan Resto" className="mb-0" />
      <EarningsCard today={todayTotal} week={weekTotal} cashDeduction={cashDeduction} />

      <Card className="flex flex-col gap-2">
        <SectionHeader title="Tren Pendapatan (7 Hari Terakhir)" className="mb-0" />
        {/* Axes and grid take the muted ink via currentColor; the line is money, so it is gold (pay). */}
        <div className="h-56 text-ink-muted">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.18} />
              <XAxis dataKey="day" stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString('id-ID')}rb` : String(v))} style={{ fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }} />
              <Tooltip
                formatter={(val) => `Rp ${val.toLocaleString('id-ID')}`}
                cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }}
                contentStyle={{
                  background: 'rgb(var(--card))',
                  border: '1px solid rgb(var(--line))',
                  borderRadius: 12,
                  boxShadow: '0 16px 40px -12px rgba(6, 47, 60, 0.28)',
                  fontSize: 13,
                }}
                labelStyle={{ color: 'rgb(var(--ink))', fontWeight: 600 }}
                itemStyle={{ color: 'rgb(var(--pay-ink))', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
              />
              <Line
                type="monotone"
                dataKey="amount"
                className="text-pay"
                stroke="currentColor"
                strokeWidth={2}
                dot={{ r: 4, fill: 'currentColor', strokeWidth: 0 }}
                activeDot={{ r: 5, className: 'text-pay', fill: 'currentColor', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <PayoutPanel />
    </div>
  );
};
export default MerchantEarningsPage;
