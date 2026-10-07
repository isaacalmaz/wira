import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, ChevronRight } from 'lucide-react';
import { Badge, Card, EmptyState, Money, PageHeader, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { getDisplayStatus } from '../../constants/orderStatus';

const TONE = { completed: 'success', cancelled: 'danger', working: 'success' };

// Every WiraAsuh session assigned to this nanny, newest first.
export default function NannyOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('orders').select('id, status, scheduled_at, metadata, total_price')
      .eq('service_type', 'babysit').eq('driver_id', user.id)
      .order('scheduled_at', { ascending: false }).limit(100)
      .then(({ data }) => setOrders(data || []));
  }, [user]);

  return (
    <div className="flex flex-col gap-5 pb-20">
      <PageHeader title="Sesi" className="mb-0" />
      {orders === null ? (
        <Card className="flex min-h-[120px] items-center justify-center"><Spinner /></Card>
      ) : orders.length === 0 ? (
        <EmptyState icon={<History size={24} />} title="Belum ada sesi" description="Sesi yang Anda setujui dan selesaikan tercatat di sini." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`/nanny/active-order/${o.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sunken">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[14px] font-semibold text-ink">
                      {new Date(o.scheduled_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' })} · {o.metadata?.hours || '-'} jam
                    </span>
                    <Badge tone={TONE[o.status] || 'brand'} dot className="self-start">{getDisplayStatus(o.status)}</Badge>
                  </div>
                  <Money value={o.total_price} className="shrink-0 text-[14px] font-medium text-ink" />
                  <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
