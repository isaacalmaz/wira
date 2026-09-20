import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, Modal } from '../../components/shared/UIComponents';
import { Store, TrendingUp, ShoppingBag, BellRing, MapPin } from 'lucide-react';
import OnlineToggle from '../../components/shared/OnlineToggle';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { parseOrderDetails } from '../../utils/formatters';
import { fetchPendingOrders, acceptOrder, completeOrder, updateOrderStatus, subscribeToMerchantOrders, merchantEarnedAmount } from '../../services/orderService';
import { OrderStatus } from '../../constants/orderStatus';

const MerchantHomePage = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);

  const [merchantId, setMerchantId] = useState(null);

  useEffect(() => {
    const fetchMerchantAndStats = async () => {
      if (!user) return;
      
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .single();

      if (merchantData) {
        setMerchantId(merchantData.id);
        const { data } = await supabase
          .from('orders')
          .select('total_price, delivery_fee, status')
          .eq('merchant_id', merchantData.id)
          .gte('created_at', new Date().toISOString().split('T')[0]);

        if (data) {
          setTodayOrders(data.length);
          // Real merchant share per migrations/0028's payout trigger, not
          // raw total_price (which for food also includes the delivery fee
          // the driver earns, and for either order type includes the 20%
          // platform commission the merchant never sees) - see
          // merchantEarnedAmount's doc comment in orderService.js.
          const earnings = data.filter(d => d.status === 'completed').reduce((sum, d) => sum + merchantEarnedAmount(d), 0);
          setTodayEarnings(earnings);
        }
      }
    };
    fetchMerchantAndStats();
  }, [user]);

  useEffect(() => {
    if (!isOpen || !merchantId) {
      setIncomingOrder(null);
      return;
    }

    const checkPendingOrders = async () => {
      if (activeOrder) return;
      try {
        const pending = await fetchPendingOrders(supabase, 'merchant', merchantId);
        const latest = pending[0];
        if (latest) {
          setIncomingOrder(prev => {
            if (!prev || prev.id !== latest.id) {
              toast.success('Ada pesanan menunggu!', { icon: isVillaOrder(latest) ? '🏡' : '🍲' });
              return latest;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('checkPendingOrders failed:', err);
      }
    };

    checkPendingOrders();

    const interval = setInterval(() => {
      checkPendingOrders();
    }, 10000);

    const unsubscribe = subscribeToMerchantOrders(supabase, merchantId, (order) => {
      if (!activeOrder) {
        setIncomingOrder(order);
        toast.success(isVillaOrder(order) ? 'Permintaan Reservasi Baru Masuk!' : 'Pesanan Makanan Baru Masuk!', { icon: isVillaOrder(order) ? '🏡' : '🍲' });
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [isOpen, activeOrder, merchantId]);

  const isVillaOrder = (order) => order && (order.service_type === 'villa' || order.service_type === 'WiraVilla');

  const handleAcceptOrder = async () => {
    if (!incomingOrder) return;
    try {
      const accepted = await acceptOrder(supabase, incomingOrder.id, merchantId, 'merchant');
      setActiveOrder(accepted);
      setIncomingOrder(null);
      toast.success(isVillaOrder(accepted) ? 'Reservasi Dikonfirmasi!' : 'Pesanan Diterima! Silakan siapkan makanan.');
    } catch (err) {
      toast.error('Pesanan sudah diproses.');
      setIncomingOrder(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (!activeOrder) return;
    try {
      if (isVillaOrder(activeOrder)) {
        // Villa reservations have no prep/delivery leg - ACCEPTED -> COMPLETED
        // directly is correct here, and the DB payout trigger credits the
        // merchant right away on this same transition.
        await completeOrder(supabase, activeOrder.id, merchantId, 'merchant');
        setActiveOrder(null);
        toast.success('Reservasi Selesai!');
        setTodayOrders(prev => prev + 1);
        // Villa's delivery_fee is always 0, so merchantEarnedAmount here is
        // just total_price * 0.8 (the trigger's real commission-adjusted
        // share) - not the raw total_price this used to add.
        setTodayEarnings(prev => prev + merchantEarnedAmount(activeOrder));
      } else {
        // Food: this button means "I've finished preparing it," NOT "hand
        // it to a driver" - a driver hasn't picked it up yet. Route through
        // PREPARING -> READY (VALID_TRANSITIONS requires PREPARING as an
        // intermediate hop) so the order actually becomes visible to
        // drivers, instead of jumping straight to COMPLETED and skipping
        // the driver leg entirely.
        await updateOrderStatus(supabase, activeOrder.id, OrderStatus.PREPARING, merchantId, 'merchant');
        await updateOrderStatus(supabase, activeOrder.id, OrderStatus.READY, merchantId, 'merchant');
        setActiveOrder(null);
        toast.success('Pesanan Siap! Menunggu driver mengambil.');
        setTodayOrders(prev => prev + 1);
        // No earnings bump here: the order hasn't reached 'completed' (no
        // driver has delivered it yet), so the DB payout trigger hasn't
        // credited the merchant anything yet either - adding to
        // todayEarnings now would be both premature and the wrong amount.
      }
    } catch (err) {
      toast.error('Gagal menyelesaikan pesanan');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg"><Store className="text-primary" /></div>
          <div>
            <h1 className="text-lg font-bold">{user?.name || 'Warung Anda'}</h1>
            <p className="text-sm text-slate-500">{activeOrder ? (isVillaOrder(activeOrder) ? 'Reservasi Aktif...' : 'Sedang Memasak...') : (isOpen ? 'Toko Buka' : 'Toko Tutup')}</p>
          </div>
        </div>
        {!activeOrder && (
          <OnlineToggle isOnline={isOpen} onChange={setIsOpen} />
        )}
      </div>

      {!activeOrder ? (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4 bg-gradient-to-br from-blue-500 to-primary text-white border-none">
            <p className="text-blue-100 text-sm">Pesanan Hari Ini</p>
            <div className="flex items-center gap-2 mt-1 mb-2">
              <ShoppingBag size={20} />
              <h2 className="text-3xl font-bold">{todayOrders}</h2>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white border-none">
            <p className="text-green-100 text-sm">Pendapatan</p>
            <div className="flex items-center gap-2 mt-1 mb-2">
              <TrendingUp size={20} />
              <h2 className="text-lg sm:text-2xl font-bold">Rp {todayEarnings.toLocaleString('id-ID')}</h2>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-5 border-2 border-primary space-y-4 shadow-lg animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
              <Store size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg">{isVillaOrder(activeOrder) ? 'Reservasi Terkonfirmasi' : 'Pesanan Harus Disiapkan'}</h3>
              <p className="text-sm text-slate-500">Order ID: {activeOrder.id.slice(0,8)}</p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-sm mb-2 border border-slate-100 dark:border-slate-700">
             <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">{activeOrder.title || (isVillaOrder(activeOrder) ? 'Reservasi WiraVilla' : 'Pesanan WiraFood')}</p>
             <p className="text-slate-600 dark:text-slate-400">{parseOrderDetails(activeOrder.details) || 'Tidak ada detail'}</p>
          </div>

          <div className="flex justify-between items-center text-xl font-bold pt-2">
            <span>Total Tagihan:</span>
            <span className="text-primary">Rp {(activeOrder.total_price || 0).toLocaleString('id-ID')}</span>
          </div>
          <Button variant="primary" className="w-full font-bold" onClick={handleCompleteOrder}>
            {isVillaOrder(activeOrder) ? 'Tandai Selesai' : 'Tandai Siap / Selesai'}
          </Button>
        </Card>
      )}

      {/* Incoming Order Popup */}
      {isOpen && incomingOrder && (
      <Modal
        isOpen={true}
        onClose={() => {}}
        closeOnBackdrop={false}
        className="max-w-sm p-6 border-2 border-primary relative overflow-hidden"
      >
            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                <BellRing size={32} className="animate-bounce" />
              </div>
              <Badge variant="primary" className="mb-2">{incomingOrder.title || (isVillaOrder(incomingOrder) ? 'Reservasi WiraVilla' : 'Wira Food')}</Badge>
              <h2 className="text-2xl font-bold">Rp {(incomingOrder.total_price || 0).toLocaleString('id-ID')}</h2>
              <p className="text-slate-500 mt-2 text-sm">{parseOrderDetails(incomingOrder.details) || 'Pesanan baru masuk!'}</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptOrder}>{isVillaOrder(incomingOrder) ? 'Konfirmasi Reservasi' : 'Terima Pesanan'}</Button>
            </div>
      </Modal>
      )}
    </div>
  );
};
export default MerchantHomePage;
