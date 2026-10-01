import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Wallet, TrendingUp, Banknote } from 'lucide-react';
import { Card, PageHeader, Stat, Money, ListRow } from '../../components/ui';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { technicianEarnedAmount, cashCommissionDeduction } from '../../services/orderService';

// Matches TechOrdersPage.jsx/TechHomePage.jsx's real filter list - previously
// this page only queried service_type 'service', silently excluding 'pool'
// (and the WiraService/WiraPool variants) from a technician's own earnings
// totals even though Home/Orders correctly include them.
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];

// ---- Presentational helpers (Tenun Laut) ----

/** Rupiah that can be negative (Tunai orders net the commission out of the
 * saldo), rounded the same way formatSignedRupiah does. */
const SignedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return <Money value={n} sign={n < 0 ? 'minus' : undefined} className={className} />;
};

// Recharts needs raw colours: Laut 500 bars; axis text and grid lines are
// themed through the token classes on the wrapper instead.
const CHART_BAR = '#16788C';
const chartTheme = '[&_.recharts-cartesian-axis-tick-value]:fill-ink-muted [&_.recharts-cartesian-grid_line]:stroke-line';
const tooltipStyle = {
  background: 'rgb(var(--card))',
  border: '1px solid rgb(var(--line))',
  borderRadius: 12,
  color: 'rgb(var(--ink))',
  fontSize: 12,
  boxShadow: '0 16px 40px -12px rgba(6, 47, 60, 0.28)',
};

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
        .select('total_price, payment_method, created_at, status_changed_at')
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
          // Counted on the day the job was finished (status_changed_at of a
          // completed order, migrations/0088), not the day it was booked.
          const oDate = new Date(o.status_changed_at || o.created_at);
          const oDateStr = oDate.toLocaleDateString('id-ID');
          // Real technician share (80%, matching driver/merchant), not raw
          // total_price - see technicianEarnedAmount's doc comment.
          const price = technicianEarnedAmount(o);

          if (oDateStr === todayStr) tSum += price;
          const dayEntry = weekDays.find(w => w.dateStr === oDateStr);
          if (dayEntry) {
            dayEntry.amount += price;
            wSum += price;
            cashSum += cashCommissionDeduction(o, 'driver');
          }
        });

        setTodayTotal(tSum);
        setWeekTotal(wSum);
        setCashDeduction(cashSum);
        setChartData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  const activeDays = chartData.filter((d) => d.amount !== 0).slice().reverse();

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Pendapatan Teknisi" className="mb-0" />

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Pendapatan Hari Ini" value={<SignedMoney value={todayTotal} />} icon={<Wallet size={18} />} tone="pay" />
          <Stat label="7 Hari Terakhir" value={<SignedMoney value={weekTotal} />} icon={<TrendingUp size={18} />} tone="pay" />
        </div>
        {cashDeduction > 0 && (
          <Card padding="md" className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2 text-[13px] font-semibold text-ink">
                <Banknote size={17} className="mt-0.5 shrink-0 text-pay-ink" aria-hidden="true" />
                Komisi tunai (dipotong dari saldo)
              </span>
              <SignedMoney value={-cashDeduction} className="shrink-0 text-[14px] font-medium text-danger-ink" />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">Order Tunai: uang dari pelanggan sudah Anda terima langsung, jadi komisi Wira (dan bagian resto untuk WiraFood yang Anda antar) dipotong dari saldo. Sudah termasuk dalam angka di atas.</p>
          </Card>
        )}
      </section>

      <Card padding="none">
        <h2 className="px-4 pb-2 pt-4 text-[15px] font-bold tracking-tight text-ink">Grafik Mingguan (7 Hari Terakhir)</h2>
        <div className={`h-56 px-2 pb-3 ${chartTheme}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="day" fontSize={12} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString('id-ID')}rb` : String(v))} />
              <Tooltip
                cursor={{ fill: 'rgba(22, 120, 140, 0.08)' }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'rgb(var(--muted))', marginBottom: 2 }}
                itemStyle={{ color: 'rgb(var(--ink))', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                formatter={(v) => [`Rp ${Number(v).toLocaleString('id-ID')}`, 'Pendapatan']}
              />
              <Bar dataKey="amount" fill={CHART_BAR} radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {activeDays.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {activeDays.map((d) => (
              <li key={d.dateStr}>
                <ListRow
                  className="px-4 py-3"
                  title={d.day}
                  subtitle={<span className="font-mono">{d.dateStr}</span>}
                  trailing={<SignedMoney value={d.amount} className="text-[14px] font-medium text-ink" />}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PayoutPanel />
    </div>
  );
};
export default TechEarningsPage;
