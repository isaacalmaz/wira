import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { Card, Money, IconTile, ListRow } from '../../components/ui';
import EarningsPage from '../../components/shared/EarningsPage';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { driverEarnedAmount, cashCommissionDeduction } from '../../services/orderService';
import { EARNINGS_COLUMNS } from '../../utils/earnings';

// One driver portal: every order assigned to this driver regardless of
// service type (driverEarnedAmount computes the ride/send/food share).
const DriverEarningsPage = () => {
  const { user } = useAuth();

  // Tips (submit_review_and_tip) land in wallet_balance, not payable_balance,
  // so they are shown separately from the payout panel.
  const [walletBalance, setWalletBalance] = useState(0);
  const [recentTips, setRecentTips] = useState([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('users').select('wallet_balance').eq('id', user.id).single(),
      supabase.from('transactions').select('id, amount, description, created_at')
        .eq('user_id', user.id).eq('type', 'transfer_in')
        .order('created_at', { ascending: false }).limit(5),
    ]).then(([{ data: userRow }, { data: txRows }]) => {
      if (userRow) setWalletBalance(Number(userRow.wallet_balance) || 0);
      if (txRows) setRecentTips(txRows);
    });
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return null;
    const { data, error } = await supabase.from('orders').select(EARNINGS_COLUMNS)
      .eq('driver_id', user.id).eq('status', 'completed');
    if (error) throw error;
    return data;
  };

  return (
    <EarningsPage
      title="Pendapatan"
      fetchOrders={fetchOrders}
      amount={driverEarnedAmount}
      cash={(o) => cashCommissionDeduction(o, 'driver')}
      deps={[user?.id]}
    >
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
    </EarningsPage>
  );
};
export default DriverEarningsPage;
