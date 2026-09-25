import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Button, EmptyState } from '../../components/shared/UIComponents';
import { Clock, RefreshCw, MessageCircle, ClipboardList } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { OrderStatus } from '../../constants/orderStatus';
import { updateOrderStatus } from '../../services/orderService';
import { parseOrderDetails } from '../../utils/formatters';
import ChatModal from '../../components/common/ChatModal';
import API_BASE_URL from '../../config/api';

const MerchantOrdersPage = () => {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [chatOrder, setChatOrder] = useState(null); // {id, customerName} | null

  const openChat = async (order) => {
    let customerName = 'Pelanggan';
    if (order.user_id) {
      const profiles = await fetchCounterpartyProfiles(supabase, [order.user_id]);
      if (profiles[order.user_id]?.name) customerName = profiles[order.user_id].name;
    }
    setChatOrder({ id: order.id, customerName });
  };

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);

    let mId = merchantId;
    if (!mId) {
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .single();
      mId = merchantData?.id;
      setMerchantId(mId || null);
    }

    if (!mId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('merchant_id', mId)
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  // Fires the real push-notification pipeline (backend's POST
  // /api/notifications/order-alert, see notification.routes.js) the moment
  // this merchant marks a food order 'ready' - the customer is the one
  // single, always-known target at this point (the driver who'll pick it up
  // isn't assigned yet). Best-effort: a failure here (no fcm_token saved yet,
  // no VAPID key configured client-side, network hiccup) must never block or
  // roll back the actual order-status update above it.
  const notifyOrderReady = async (order) => {
    if (!order?.user_id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`${API_BASE_URL}/notifications/order-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: order.user_id,
          title: 'Pesanan Anda Siap!',
          body: 'Pesanan WiraFood Anda sudah siap dan sedang menunggu kurir untuk diantar.',
          data: { orderId: order.id, type: 'order_ready' },
        }),
      });
    } catch (err) {
      console.error('notifyOrderReady failed:', err);
    }
  };

  const updateStatus = async (order, newStatus) => {
    try {
      await updateOrderStatus(supabase, order.id, newStatus, merchantId, 'merchant');
      toast.success('Status pesanan diperbarui');
      if (newStatus === OrderStatus.READY) {
        notifyOrderReady(order);
      }
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui status pesanan');
    }
  };

  const filteredOrders = orders.filter(o => tab === 'active' ? (o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED) : (o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED));

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
        {filteredOrders.length > 0 ? filteredOrders.map(order => {
          const isVilla = order.service_type === 'villa' || order.service_type === 'WiraVilla';
          return (
          <Card key={order.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <Badge variant={order.status === OrderStatus.PENDING ? 'danger' : 'primary'} className="mb-1 capitalize">{order.status}</Badge>
                <h3 className="font-bold text-xs">{order.id.slice(0,12)}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Clock size={12}/> {new Date(order.created_at).toLocaleTimeString('id-ID')} • User: {order.user_id?.slice(0,6)}</p>
              </div>
              <span className="font-bold text-lg text-primary">Rp {(order.total_price || 0).toLocaleString('id-ID')}</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg mb-4 text-sm">
               <p className="text-slate-800 dark:text-slate-200 font-bold mb-1">{order.title || (isVilla ? 'Reservasi WiraVilla' : 'Pesanan WiraFood')}</p>
               <p className="text-slate-600 dark:text-slate-400">{parseOrderDetails(order.details) || (isVilla ? 'Tidak ada detail reservasi' : 'Tidak ada detail menu')}</p>
            </div>

            {tab === 'active' && (
              <div className="flex gap-2">
                {order.status === OrderStatus.PENDING ? (
                  <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.ACCEPTED)}>{isVilla ? 'Konfirmasi Reservasi' : 'Terima'}</Button>
                ) : (
                  <>
                    {isVilla ? (
                      order.status === OrderStatus.ACCEPTED && (
                        <Button variant="primary" className="flex-1 bg-green-600" onClick={() => updateStatus(order, OrderStatus.COMPLETED)}>Tandai Selesai</Button>
                      )
                    ) : order.status === OrderStatus.ACCEPTED ? (
                      <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.PREPARING)}>Mulai Siapkan</Button>
                    ) : order.status === OrderStatus.PREPARING ? (
                      <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.READY)}>Siap Diambil</Button>
                    ) : order.status === OrderStatus.READY ? (
                      <div className="flex-1 text-center text-sm font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 py-2.5 rounded-lg">
                        Menunggu kurir mengambil pesanan...
                      </div>
                    ) : order.status === OrderStatus.PICKING_UP || order.status === OrderStatus.IN_TRIP ? (
                      <div className="flex-1 text-center text-sm font-medium text-primary bg-primary/10 py-2.5 rounded-lg">
                        Kurir sedang mengantar
                      </div>
                    ) : null}
                    <Button variant="outline" className="px-3 flex items-center gap-1.5" onClick={() => openChat(order)}>
                      <MessageCircle size={16} /> Chat
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
          );
        }) : (
          <Card><EmptyState icon={ClipboardList} title="Tidak ada pesanan" description={tab === 'active' ? 'Pesanan baru akan muncul di sini.' : 'Belum ada riwayat pesanan.'} /></Card>
        )}
      </div>

      {chatOrder && (
        <ChatModal
          orderId={chatOrder.id}
          onClose={() => setChatOrder(null)}
          receiverName={chatOrder.customerName}
        />
      )}
    </div>
  );
};
export default MerchantOrdersPage;
