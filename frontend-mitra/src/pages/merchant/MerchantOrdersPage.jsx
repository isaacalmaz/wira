import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import { Clock, RefreshCw } from 'lucide-react';

const MerchantOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('service_type', 'food')
      .order('created_at', { ascending: false });
    
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const updateStatus = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    fetchOrders();
  };

  const filteredOrders = orders.filter(o => tab === 'active' ? (o.status !== 'completed' && o.status !== 'rejected') : (o.status === 'completed' || o.status === 'rejected'));

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Daftar Pesanan</h1>
        <button onClick={fetchOrders} className="p-2 border rounded-full hover:bg-slate-50"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-4">
        <button onClick={() => setTab('active')} className={`flex-1 py-2 text-sm font-medium rounded-md ${tab === 'active' ? 'bg-white dark:bg-slate-800 shadow text-primary' : 'text-slate-500'}`}>Aktif</button>
        <button onClick={() => setTab('history')} className={`flex-1 py-2 text-sm font-medium rounded-md ${tab === 'history' ? 'bg-white dark:bg-slate-800 shadow text-primary' : 'text-slate-500'}`}>Riwayat</button>
      </div>

      <div className="space-y-4">
        {filteredOrders.length > 0 ? filteredOrders.map(order => (
          <Card key={order.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <Badge variant={order.status === 'pending' ? 'danger' : 'primary'} className="mb-1 capitalize">{order.status}</Badge>
                <h3 className="font-bold text-xs">{order.id.slice(0,12)}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock size={12}/> {new Date(order.created_at).toLocaleTimeString('id-ID')} • User: {order.user_id?.slice(0,6)}</p>
              </div>
              <span className="font-bold text-lg text-primary">Rp {(order.total_price || 0).toLocaleString('id-ID')}</span>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg mb-4 text-sm">
               {/* Untuk realita, kita harus menyimpan detail item di orders. Tapi karena MVP kita belum, kita tulis dummy atau biarkan kosong */}
               <p className="text-slate-600 dark:text-slate-300 font-medium italic">Pesanan WiraFood</p>
            </div>

            {tab === 'active' && (
              <div className="flex gap-2">
                {order.status === 'pending' ? (
                  <Button variant="primary" className="flex-1" onClick={() => updateStatus(order.id, 'accepted')}>Terima</Button>
                ) : (
                  <Button variant="primary" className="flex-1 bg-green-600" onClick={() => updateStatus(order.id, 'completed')}>Tandai Selesai</Button>
                )}
              </div>
            )}
          </Card>
        )) : (
          <div className="text-center py-10 text-slate-500">Tidak ada pesanan.</div>
        )}
      </div>
    </div>
  );
};
export default MerchantOrdersPage;
