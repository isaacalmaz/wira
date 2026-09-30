import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Gift, Wallet, TrendingUp, Banknote } from 'lucide-react';
import { Card, PageHeader, SectionHeader, Segmented, Stat, Money, IconTile, ListRow } from '../../components/ui';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { driverEarnedAmount, cashCommissionDeduction } from '../../services/orderService';

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

const DriverEarningsPage = () => {
  const { user } = useAuth();
  // One unified Driver portal - earnings cover every order ever assigned to
  // this driver regardless of service type (ride/send/food share is already
  // computed correctly per-order by driverEarnedAmount).
  const [earningsData, setEarningsData] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [cashDeduction, setCashDeduction] = useState(0);

  // Tips (migrations/0039/0041's submit_review_and_tip) land in
  // wallet_balance, NOT payable_balance - they're WiraPay spending balance,
  // separate from the order-completion payout PayoutPanel already shows.
  // Nothing in frontend-mitra read wallet_balance/transactions at all
  // before this, so a driver had no way to even know a tip arrived.
  const [walletBalance, setWalletBalance] = useState(0);
  const [recentTips, setRecentTips] = useState([]);

  useEffect(() => {
    const fetchWalletAndTips = async () => {
      if (!user) return;
      const [{ data: userRow }, { data: txRows }] = await Promise.all([
        supabase.from('users').select('wallet_balance').eq('id', user.id).single(),
        supabase
          .from('transactions')
          .select('id, amount, description, created_at')
          .eq('user_id', user.id)
          .eq('type', 'transfer_in')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (userRow) setWalletBalance(Number(userRow.wallet_balance) || 0);
      if (txRows) setRecentTips(txRows);
    };
    fetchWalletAndTips();
  }, [user]);

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('total_price, delivery_fee, merchant_id, payment_method, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'completed');
        
      if (data) {
        let totalToday = 0;
        let totalWeek = 0;
        let cashTotal = 0;
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
          // Real driver share per migrations/0028's payout trigger, not raw
          // total_price - see driverEarnedAmount's doc comment.
          const price = driverEarnedAmount(order);

          if (orderDateStr === todayStr) {
            totalToday += price;
          }
          totalWeek += price;
          cashTotal += cashCommissionDeduction(order, 'driver');

          const foundDay = weekDays.find(w => w.dateStr === orderDateStr);
          if (foundDay) {
            foundDay.amount += price;
          }
        });

        setTodayTotal(totalToday);
        setWeekTotal(totalWeek);
        setCashDeduction(cashTotal);
        setEarningsData(weekDays);
      }
    };
    fetchEarnings();
  }, [user]);

  const activeDays = earningsData.filter((d) => d.amount !== 0).slice().reverse();

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Pendapatan" className="mb-0" />

      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Pendapatan Hari Ini" value={<SignedMoney value={todayTotal} />} icon={<Wallet size={18} />} tone="pay" />
          <Stat label="Minggu ini" value={<SignedMoney value={weekTotal} />} icon={<TrendingUp size={18} />} tone="pay" />
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
        <div className="flex items-center gap-3 px-4 pb-2 pt-4">
          <h2 className="flex-1 text-[15px] font-bold tracking-tight text-ink">Grafik Pendapatan</h2>
          <Segmented size="sm" ariaLabel="Periode" options={[{ value: 'harian', label: 'Harian' }]} value="harian" />
        </div>
        <div className={`h-56 px-2 pb-3 ${chartTheme}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earningsData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 4" />
              <XAxis dataKey="day" fontSize={12} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString('id-ID')}rb` : String(v))} />
              <Tooltip
                cursor={{ fill: 'rgba(22, 120, 140, 0.08)' }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'rgb(var(--muted))', marginBottom: 2 }}
                itemStyle={{ color: 'rgb(var(--ink))', fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                formatter={(val) => [`Rp ${Number(val).toLocaleString('id-ID')}`, 'Pendapatan']}
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

      {/* Saldo WiraPay & Tip dari Pelanggan */}
      <Card padding="none">
        <div className="flex items-center gap-3 p-4">
          <IconTile tone="pay" size="sm"><Gift size={18} /></IconTile>
          <h2 className="min-w-0 flex-1 text-[15px] font-bold tracking-tight text-ink">Saldo WiraPay & Tip</h2>
          <Money value={walletBalance} tone="pay" className="text-[16px] font-medium" />
        </div>
        {recentTips.length === 0 ? (
          <p className="border-t border-line px-4 py-4 text-sm text-ink-muted">Belum ada tip dari pelanggan.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {recentTips.map((tx) => (
              <li key={tx.id}>
                <ListRow
                  className="px-4 py-3"
                  title={tx.description || 'Tip dari Pelanggan'}
                  subtitle={new Date(tx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  trailing={<Money value={tx.amount} sign="plus" tone="in" className="text-[14px] font-medium" />}
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
export default DriverEarningsPage;
