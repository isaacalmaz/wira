import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Stat } from '../../components/ui';
import EarningsPage, { SignedMoney } from '../../components/shared/EarningsPage';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { technicianEarnedAmount, cashCommissionDeduction } from '../../services/orderService';
import { EARNINGS_COLUMNS } from '../../utils/earnings';

// Same list TechOrdersPage/TechHomePage use: service and pool jobs.
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];

const TechEarningsPage = () => {
  const { user } = useAuth();
  const [projectIncome, setProjectIncome] = useState({ week: 0, total: 0 }); // migrations/0093

  // Released project stages, minus the commission fixed when the project
  // was awarded (projects.commission_rate, migrations/0099; 10% before).
  useEffect(() => {
    if (!user) return;
    supabase.from('project_milestones').select('amount, released_at, projects!inner(awarded_to, commission_rate)')
      .eq('status', 'released').eq('projects.awarded_to', user.id)
      .then(({ data }) => {
        const weekAgo = Date.now() - 7 * 86400000;
        let week = 0; let total = 0;
        (data || []).forEach((m) => {
          const net = Number(m.amount) * (1 - Number(m.projects?.commission_rate ?? 0.1));
          total += net;
          if (new Date(m.released_at).getTime() >= weekAgo) week += net;
        });
        setProjectIncome({ week, total });
      });
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return null;
    const { data, error } = await supabase.from('orders').select(EARNINGS_COLUMNS)
      .eq('driver_id', user.id).in('service_type', TECHNICIAN_SERVICE_TYPES).eq('status', 'completed');
    if (error) throw error;
    return data;
  };

  return (
    <EarningsPage
      title="Pendapatan Teknisi"
      fetchOrders={fetchOrders}
      amount={technicianEarnedAmount}
      cash={(o) => cashCommissionDeduction(o, 'driver')}
      deps={[user?.id]}
    >
      {projectIncome.total > 0 && (
        <Stat
          label="Pendapatan Proyek (7 hari)"
          value={<SignedMoney value={projectIncome.week} />}
          icon={<TrendingUp size={18} />}
          tone="pay"
          hint={<>Total dari proyek: <SignedMoney value={projectIncome.total} className="font-medium text-ink" /></>}
        />
      )}
    </EarningsPage>
  );
};
export default TechEarningsPage;
