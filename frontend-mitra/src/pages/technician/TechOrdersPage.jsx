import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, EmptyState } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { Clock, MessageCircle, Wrench } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { OrderStatus } from '../../constants/orderStatus';
import { updateOrderStatus } from '../../services/orderService';
import { parseOrderDetails } from '../../utils/formatters';
import ChatModal from '../../components/common/ChatModal';

const TechOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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
    supabase.from('users').select('name').eq('id', activeOrder.user_id).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCustomerName(data?.name || 'Klien');
      });
    return () => { cancelled = true; };
  }, [activeOrder?.user_id]);

  const updateStatus = async (newStatus) => {
    if (activeOrder) {
      try {
        await updateOrderStatus(supabase, activeOrder.id, newStatus);
        toast.success(`Status pekerjaan diubah ke: ${newStatus}`);
        fetchOrders();
      } catch (err) {
        toast.error('Gagal memperbarui status');
      }
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pekerjaan Aktif</h1>

      {activeOrder ? (
        <Card className="p-4 border-primary/50 shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <Badge variant="primary" className="mb-2 capitalize">{activeOrder.service_type}</Badge>
              <h3 className="font-bold text-lg">{activeOrder.title || 'Pekerjaan'}</h3>
              <p className="text-sm font-medium mt-1">Klien: {customerName}</p>
            </div>
            <span className="font-bold text-primary">~Rp {(activeOrder.total_price || 0).toLocaleString('id-ID')}</span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg space-y-2 mb-4">
            <div className="flex items-start gap-2 text-sm">
              <Clock size={16} className="text-slate-400 mt-0.5" />
              <span>{parseOrderDetails(activeOrder.details) || 'Tidak ada detail tambahan'}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex items-center justify-center gap-1.5" onClick={() => setIsChatOpen(true)}>
              <MessageCircle size={16} /> Chat
            </Button>
          </div>

          {activeOrder.status === OrderStatus.WORKING && (
             <div className="mt-4 p-4 border-2 border-dashed border-slate-300 rounded-lg text-center cursor-pointer hover:bg-slate-50">
               <p className="text-sm font-medium text-slate-500">Selesaikan pekerjaan lalu tandai selesai di bawah</p>
             </div>
          )}

          <div className="mt-4">
            <StatusUpdater currentStatus={activeOrder.status} role="technician" onUpdate={updateStatus} />
          </div>
        </Card>
      ) : (
        <Card><EmptyState icon={Wrench} title="Tidak ada pekerjaan aktif" description="Pekerjaan yang Anda terima akan muncul di sini." /></Card>
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
