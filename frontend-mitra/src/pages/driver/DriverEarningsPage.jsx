import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Gift } from 'lucide-react';
import { Card } from '../../components/shared/UIComponents';
import EarningsCard from '../../components/shared/EarningsCard';
import PayoutPanel from '../../components/shared/PayoutPanel';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { driverEarnedAmount, cashCommissionDeduction } from '../../services/orderService';

const DriverEarningsPage = () => {
  const { user } = useAuth();
  // One unified Driver portal - earnings cover every order ever assigned to
  // this driver regardless of service type (ride/send/food share is already
  // computed correctly per-order by driverEarnedAmount).
  const [tab, setTab] = useState('daily');
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

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold">Pendapatan</h1>
      
      <EarningsCard today={todayTotal} week={weekTotal} cashDeduction={cashDeduction} />

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

      {/* Saldo WiraPay & Tip dari Pelanggan */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Gift size={18} className="text-primary" /> Saldo WiraPay & Tip
          </h3>
          <span className="font-bold text-primary">Rp {walletBalance.toLocaleString('id-ID')}</span>
        </div>
        {recentTips.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada tip dari pelanggan.</p>
        ) : (
          <div className="space-y-2">
            {recentTips.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm border-b border-slate-100 dark:border-slate-700 last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="text-slate-700 dark:text-slate-300">{tx.description || 'Tip dari Pelanggan'}</p>
                  <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className="font-bold text-green-600">+Rp {Number(tx.amount).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PayoutPanel />
    </div>
  );
};
export default DriverEarningsPage;
