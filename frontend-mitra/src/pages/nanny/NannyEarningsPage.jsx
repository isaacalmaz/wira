import EarningsPage from '../../components/shared/EarningsPage';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { technicianEarnedAmount, cashCommissionDeduction } from '../../services/orderService';
import { EARNINGS_COLUMNS } from '../../utils/earnings';

// Same share rule as a technician visit: total minus the stamped commission.
export default function NannyEarningsPage() {
  const { user } = useAuth();
  const fetchOrders = async () => {
    if (!user) return null;
    const { data, error } = await supabase.from('orders').select(EARNINGS_COLUMNS)
      .eq('driver_id', user.id).eq('service_type', 'babysit').eq('status', 'completed');
    if (error) throw error;
    return data;
  };
  return (
    <EarningsPage
      title="Pendapatan"
      fetchOrders={fetchOrders}
      amount={technicianEarnedAmount}
      cash={(o) => cashCommissionDeduction(o, 'driver')}
      deps={[user?.id]}
    />
  );
}
