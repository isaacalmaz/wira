import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, PageHeader, SectionHeader, Money } from '../../components/ui';
import EarningsCard from '../../components/shared/EarningsCard';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { merchantEarnedAmount, cashCommissionDeduction, loadCommissionRates } from '../../services/orderService';
import useMyMerchants from '../../hooks/useMyMerchants';

const MerchantEarningsPage = () => {
  const { user } = useAuth();
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [cashDeduction, setCashDeduction] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [byProperty, setByProperty] = useState([]);
  const { merchants, ids, kind } = useMyMerchants();
  const idsKey = ids.join(',');

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user || !idsKey) return;
      await loadCommissionRates(supabase);

      const { data } = await supabase
        .from('orders')
        .select('total_price, delivery_fee, payment_method, driver_id, created_at, title, merchant_id, service_type, status, commission_rate')
        .in('merchant_id', idsKey.split(','))
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

        // Last 30 days per property, so a host can see which villa earns.
        const monthAgo = Date.now() - 30 * 86400000;
        const perProperty = {};

        data.forEach(o => {
          if (new Date(o.created_at).getTime() >= monthAgo) {
            perProperty[o.merchant_id] = (perProperty[o.merchant_id] || 0) + merchantEarnedAmount(o);
          }
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
        setByProperty(Object.entries(perProperty).map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount));
      }
    };
    fetchEarnings();
  }, [user, idsKey]);

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title={kind === 'villa' ? 'Pendapatan Villa' : 'Pendapatan Resto'} className="mb-0" />
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

      {merchants.length > 1 && (
        <Card className="flex flex-col gap-3">
          <SectionHeader title="Per Properti (30 Hari)" className="mb-0" />
          <ul className="flex flex-col divide-y divide-line">
            {merchants.map((m) => {
              const amount = byProperty.find((p) => p.id === m.id)?.amount || 0;
              return (
                <li key={m.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0 break-words text-[14px] text-ink">{m.name}</span>
                  <Money value={amount} sign={amount < 0 ? 'minus' : undefined} className="shrink-0 text-[14px] font-medium text-ink" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <PayoutPanel />
    </div>
  );
};
export default MerchantEarningsPage;
