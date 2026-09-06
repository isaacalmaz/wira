import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { User, MapPin, Package, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const DriverOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .order('created_at', { ascending: false });
    
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const activeOrder = orders.find(o => o.status === 'accepted' || o.status === 'picking_up' || o.status === 'delivering');
  const history = orders.filter(o => o.status === 'completed');

  const updateStatus = async (newStatus) => {
    if(activeOrder) {
      try {
        await supabase.from('orders').update({ status: newStatus }).eq('id', activeOrder.id);
        fetchOrders();
        toast.success(`Status diperbarui ke: ${newStatus}`);
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
            
            <StatusUpdater currentStatus={activeOrder.status} role="driver" onUpdate={updateStatus} />
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-slate-500">
          <div className="text-4xl mb-2">🏍️</div>
          <p>Belum ada pesanan aktif.</p>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-bold mb-4">Riwayat Selesai</h2>
        <div className="space-y-3">
          {history.length === 0 ? (
             <p className="text-sm text-slate-500 text-center py-4">Belum ada riwayat pesanan.</p>
          ) : history.map(order => (
            <Card key={order.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="gray" className="capitalize">{order.service_type}</Badge>
                </div>
                <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('id-ID')} {new Date(order.created_at).toLocaleTimeString('id-ID')}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">Rp {(order.total_price || 0).toLocaleString('id-ID')}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DriverOrdersPage;
