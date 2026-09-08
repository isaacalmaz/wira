import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import { Store, TrendingUp, ShoppingBag, BellRing, MapPin } from 'lucide-react';
import OnlineToggle from '../../components/shared/OnlineToggle';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const MerchantHomePage = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
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
          .select('total_price, status')
          .eq('merchant_id', merchantData.id)
          .gte('created_at', new Date().toISOString().split('T')[0]); 
        
        if (data) {
          setTodayOrders(data.length);
          const earnings = data.filter(d => d.status === 'completed').reduce((sum, d) => sum + (d.total_price || 0), 0);
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

    const channel = supabase
      .channel('merchant-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` },
        (payload) => {
          if (payload.new.status === 'pending' && !activeOrder) {
            setIncomingOrder(payload.new);
            toast.success('Pesanan Makanan Baru Masuk!', { icon: '🍲' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, activeOrder, merchantId]);

  const handleAcceptOrder = async () => {
    if (!incomingOrder) return;
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'accepted' })
        .eq('id', incomingOrder.id);
        
      if (error) throw error;

      setActiveOrder(incomingOrder);
      setIncomingOrder(null);
      toast.success('Pesanan Diterima! Silakan siapkan makanan.');
    } catch (err) {
      toast.error(`Gagal: ${err.message}`);
      setIncomingOrder(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (!activeOrder) return;
    try {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', activeOrder.id);
      
      setActiveOrder(null);
      toast.success('Pesanan Selesai / Diserahkan ke Driver!');
      setTodayOrders(prev => prev + 1);
      setTodayEarnings(prev => prev + (activeOrder.total_price || 0));
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
            <p className="text-sm text-slate-500">{activeOrder ? 'Sedang Memasak...' : (isOpen ? 'Toko Buka' : 'Toko Tutup')}</p>
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
              <h3 className="font-bold text-lg">Pesanan Harus Disiapkan</h3>
              <p className="text-sm text-slate-500">Order ID: {activeOrder.id.slice(0,8)}</p>
            </div>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-sm mb-2 border border-slate-100 dark:border-slate-700">
             <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">{activeOrder.title || 'Pesanan WiraFood'}</p>
             <p className="text-slate-600 dark:text-slate-400">{activeOrder.details || 'Tidak ada detail menu'}</p>
          </div>

          <div className="flex justify-between items-center text-xl font-bold pt-2">
            <span>Total Tagihan:</span>
            <span className="text-primary">Rp {(activeOrder.total_price || 0).toLocaleString('id-ID')}</span>
          </div>
          <Button variant="primary" className="w-full font-bold" onClick={handleCompleteOrder}>
            Tandai Siap / Selesai
          </Button>
        </Card>
      )}

      {/* Incoming Order Popup */}
      {isOpen && incomingOrder && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <Card className="w-full max-w-sm p-6 bg-white dark:bg-slate-800 border-2 border-primary shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                <BellRing size={32} className="animate-bounce" />
              </div>
              <Badge variant="primary" className="mb-2">{incomingOrder.title || 'Wira Food'}</Badge>
              <h2 className="text-2xl font-bold">Rp {(incomingOrder.total_price || 0).toLocaleString('id-ID')}</h2>
              <p className="text-slate-500 mt-2 text-sm">{incomingOrder.details || 'Pesanan baru masuk!'}</p>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptOrder}>Terima Pesanan</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default MerchantHomePage;
