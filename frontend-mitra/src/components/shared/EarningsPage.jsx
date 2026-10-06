import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, PageHeader, Money, ListRow, Spinner } from '../ui';
import EarningsCard from './EarningsCard';
import PayoutPanel from './PayoutPanel';
import { supabase } from '../../config/supabase';
import { loadCommissionRates } from '../../services/orderService';
import { summarizeEarnings } from '../../utils/earnings';

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

const SignedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return <Money value={n} sign={n < 0 ? 'minus' : undefined} className={className} />;
};

/**
 * The Pendapatan page shared by driver, merchant/villa and technician.
 * - fetchOrders(): completed orders for this partner (select EARNINGS_COLUMNS)
 * - amount / cash: the role's share and Tunai deduction per order
 * - children: role-specific cards shown between the chart and the payout panel
 * - onOrders(orders): optional, for pages that derive more from the same rows
 */
export default function EarningsPage({ title, fetchOrders, amount, cash, deps = [], onOrders, children }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCommissionRates(supabase);
        const orders = await fetchOrders();
        if (cancelled || !orders) return;
        onOrders?.(orders);
        setSummary(summarizeEarnings(orders, { amount, cash }));
        setError(false);
      } catch (e) {
        console.error('Earnings load failed:', e);
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const activeDays = summary ? summary.days.filter((d) => d.amount !== 0).slice().reverse() : [];

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title={title} className="mb-0" />

      {!summary ? (
        <Card className="flex min-h-[140px] items-center justify-center text-sm text-ink-muted">
          {error ? 'Gagal memuat pendapatan. Periksa koneksi lalu buka ulang halaman ini.' : <Spinner />}
        </Card>
      ) : (
        <>
          <EarningsCard today={summary.today} week={summary.week} cashDeduction={summary.cash} />

          <Card padding="none">
            <h2 className="px-4 pb-2 pt-4 text-[15px] font-bold tracking-tight text-ink">7 Hari Terakhir</h2>
            <div className={`h-56 px-2 pb-3 ${chartTheme}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.days} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" />
                  <XAxis dataKey="day" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString('id-ID')}rb` : String(v))} />
                  <Tooltip
                    cursor={{ fill: 'rgba(22, 120, 140, 0.08)' }}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'rgb(var(--muted))', marginBottom: 2 }}
                    itemStyle={{ color: 'rgb(var(--ink))', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                    formatter={(v) => [`Rp ${Math.round(Number(v)).toLocaleString('id-ID')}`, 'Pendapatan']}
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
        </>
      )}

      {children}

      <PayoutPanel />
    </div>
  );
}

export { SignedMoney };
