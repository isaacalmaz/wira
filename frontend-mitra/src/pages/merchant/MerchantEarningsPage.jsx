import { useState } from 'react';
import { Card, SectionHeader, Money } from '../../components/ui';
import EarningsPage from '../../components/shared/EarningsPage';
import { supabase } from '../../config/supabase';
import { merchantEarnedAmount, cashCommissionDeduction } from '../../services/orderService';
import useMyMerchants from '../../hooks/useMyMerchants';
import { EARNINGS_COLUMNS, completedAt } from '../../utils/earnings';

// Restaurants and villa hosts (one owner may have several properties).
const MerchantEarningsPage = () => {
  const { merchants, ids, kind } = useMyMerchants();
  const idsKey = ids.join(',');
  const [byProperty, setByProperty] = useState({});

  const fetchOrders = async () => {
    if (!idsKey) return null;
    const { data, error } = await supabase.from('orders').select(EARNINGS_COLUMNS)
      .in('merchant_id', idsKey.split(',')).eq('status', 'completed');
    if (error) throw error;
    return data;
  };

  // Last 30 days per property, so a host can see which villa earns.
  const onOrders = (orders) => {
    const monthAgo = Date.now() - 30 * 86400000;
    const totals = {};
    orders.forEach((o) => {
      if (completedAt(o).getTime() >= monthAgo) {
        totals[o.merchant_id] = (totals[o.merchant_id] || 0) + merchantEarnedAmount(o);
      }
    });
    setByProperty(totals);
  };

  return (
    <EarningsPage
      title={kind === 'villa' ? 'Pendapatan Villa' : 'Pendapatan Resto'}
      fetchOrders={fetchOrders}
      amount={merchantEarnedAmount}
      cash={(o) => cashCommissionDeduction(o, 'merchant')}
      onOrders={onOrders}
      deps={[idsKey]}
    >
      {merchants.length > 1 && (
        <Card className="flex flex-col gap-3">
          <SectionHeader title="Per Properti (30 Hari)" className="mb-0" />
          <ul className="flex flex-col divide-y divide-line">
            {merchants.map((m) => {
              const amount = byProperty[m.id] || 0;
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
    </EarningsPage>
  );
};
export default MerchantEarningsPage;
