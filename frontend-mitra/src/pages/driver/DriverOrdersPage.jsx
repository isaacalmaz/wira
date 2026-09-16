import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Button, EmptyState } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { User, MapPin, Package, RefreshCw, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';
import { updateOrderStatus, RIDE_SERVICE_TYPES, SEND_SERVICE_TYPES, FOOD_DELIVERY_SERVICE_TYPES, driverEarnedAmount } from '../../services/orderService';

const DriverOrdersPage = () => {
  const { user } = useAuth();
  // Reused under /driver (Ride) and /courier (Kurir/Send) - see
  // DriverHomePage.jsx's identical comment for why food-delivery types are
  // included on both sides.
  const { pathname } = useLocation();
  const basePath = pathname.startsWith('/courier') ? '/courier' : '/driver';
  const myOrderServiceTypes = [...(basePath === '/courier' ? SEND_SERVICE_TYPES : RIDE_SERVICE_TYPES), ...FOOD_DELIVERY_SERVICE_TYPES];
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .in('service_type', myOrderServiceTypes)
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const activeOrder = orders.find(o => o.status === OrderStatus.ACCEPTED || o.status === OrderStatus.PICKING_UP || o.status === OrderStatus.IN_TRIP);
  const history = orders.filter(o => o.status === OrderStatus.COMPLETED);

  const updateStatus = async (newStatus) => {
    if(activeOrder) {
      try {
        await updateOrderStatus(supabase, activeOrder.id, newStatus);
        fetchOrders();
        toast.success(`Status diperbarui ke: ${getDisplayStatus(newStatus)}`);
      } catch (err) {
        toast.error('Gagal memperbarui status');
      }
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pesanan</h1>
        <button onClick={fetchOrders} className="p-2 border rounded-full hover:bg-slate-50"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      
      {activeOrder ? (
        <Card className="border-primary/50 shadow-md">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <Badge variant="primary" className="capitalize">{activeOrder.service_type}</Badge>
            <span className="font-bold text-lg text-primary">Rp {(activeOrder.total_price || 0).toLocaleString('id-ID')}</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><User size={20}/></div>
              <div>
                <p className="font-semibold text-sm">Pemesan: {activeOrder.user_id?.slice(0, 8)}</p>
                <p className="text-xs text-slate-500">Bayar via: {activeOrder.payment_method}</p>
              </div>
            </div>
            
            <StatusUpdater currentStatus={activeOrder.status} role="driver" onUpdate={updateStatus} isFoodDelivery={!!activeOrder.merchant_id} />
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={Package} title="Belum ada pesanan aktif" description="Pesanan yang Anda terima akan muncul di sini." />
        </Card>
      )}

      <div>
        <h2 className="text-xl font-bold mb-4">Riwayat Selesai</h2>
        <div className="space-y-3">
          {history.length === 0 ? (
             <Card><EmptyState icon={History} title="Belum ada riwayat" description="Pesanan yang sudah selesai akan tercatat di sini." /></Card>
          ) : history.map(order => (
            <Card key={order.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="gray" className="capitalize">{order.service_type}</Badge>
                </div>
                <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('id-ID')} {new Date(order.created_at).toLocaleTimeString('id-ID')}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">Rp {driverEarnedAmount(order).toLocaleString('id-ID')}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DriverOrdersPage;
