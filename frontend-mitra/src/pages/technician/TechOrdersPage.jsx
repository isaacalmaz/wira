import { useState, useEffect } from 'react';
import { Card, Badge, Button, EmptyState, PageHeader, Money, IconTile } from '../../components/ui';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { Clock, MessageCircle, Wrench, Waves, User } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';
import { updateOrderStatus } from '../../services/orderService';
import { parseOrderDetails } from '../../utils/formatters';
import ChatModal from '../../components/common/ChatModal';

// Technicians currently receive every service+pool job regardless of their
// declared specialization (specialization is asserted at registration but
// never enforced for routing - see RegisterPage.jsx step 3) - a hard filter
// risks stranding pool jobs with zero eligible technicians in a small
// market like Lombok, so this stays visibility-only: pool jobs get a
// distinct icon/label instead of being hidden from non-pool specialists.
const isPoolOrder = (order) => order?.service_type === 'pool' || order?.service_type === 'WiraPool';

const TechOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('Klien');
  const [isChatOpen, setIsChatOpen] = useState(false);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .in('service_type', ['service', 'pool', 'WiraService', 'WiraPool'])
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const activeOrder = orders.find(o => o.status === OrderStatus.ACCEPTED || o.status === OrderStatus.ON_THE_WAY || o.status === OrderStatus.WORKING);

  useEffect(() => {
    if (!activeOrder?.user_id) {
      setCustomerName('Klien');
      return;
    }
    let cancelled = false;
    fetchCounterpartyProfiles(supabase, [activeOrder.user_id])
      .then((profiles) => {
        if (!cancelled) setCustomerName(profiles[activeOrder.user_id]?.name || 'Klien');
      });
    return () => { cancelled = true; };
  }, [activeOrder?.user_id]);

  const updateStatus = async (newStatus) => {
    if (activeOrder) {
      try {
        await updateOrderStatus(supabase, activeOrder.id, newStatus, user.id, 'technician');
        toast.success(`Status pekerjaan diubah ke: ${newStatus}`);
        fetchOrders();
      } catch (err) {
        toast.error('Gagal memperbarui status');
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Pekerjaan Aktif" className="mb-0" />

      {activeOrder ? (
        <Card padding="none" className="border-brand-line">
          <div className="flex items-start gap-3 border-b border-line p-4">
            <IconTile tone="brand" size="sm">
              {isPoolOrder(activeOrder) ? <Waves size={18} /> : <Wrench size={18} />}
            </IconTile>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={isPoolOrder(activeOrder) ? 'brand' : 'neutral'} className="capitalize">
                  {isPoolOrder(activeOrder) ? 'Kolam Renang' : activeOrder.service_type}
                </Badge>
                <Badge tone="brand" dot>{getDisplayStatus(activeOrder.status)}</Badge>
              </div>
              <h2 className="break-words text-[16px] font-bold leading-snug tracking-tight text-ink text-balance">{activeOrder.title || 'Pekerjaan'}</h2>
            </div>
            <span className="shrink-0 pt-0.5 text-[17px] font-medium text-ink">
              <span className="font-mono text-ink-muted">~</span><Money value={activeOrder.total_price || 0} />
            </span>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5 text-[14px]">
              <User size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 break-words font-semibold text-ink">Klien: {customerName}</span>
            </div>

            <div className="flex items-start gap-2.5 rounded-control border border-line bg-sunken px-3.5 py-3 text-[13px] leading-relaxed text-ink">
              <Clock size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 break-words">{parseOrderDetails(activeOrder.details) || 'Tidak ada detail tambahan'}</span>
            </div>

            <Button variant="secondary" block leftIcon={<MessageCircle size={17} />} onClick={() => setIsChatOpen(true)}>
              Chat
            </Button>

            {activeOrder.status === OrderStatus.WORKING && (
              <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-center text-[13px] font-medium text-ink-muted">
                Selesaikan pekerjaan lalu tandai selesai di bawah
              </p>
            )}

            <StatusUpdater currentStatus={activeOrder.status} role="technician" onUpdate={updateStatus} />
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Wrench size={24} />} title="Tidak ada pekerjaan aktif" description="Pekerjaan yang Anda terima akan muncul di sini." />
      )}

      {isChatOpen && activeOrder && (
        <ChatModal
          orderId={activeOrder.id}
          onClose={() => setIsChatOpen(false)}
          receiverName={customerName}
        />
      )}
    </div>
  );
};
export default TechOrdersPage;
