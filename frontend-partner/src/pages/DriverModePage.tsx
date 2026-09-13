import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle, MapPin, Package, RefreshCw } from 'lucide-react';
import { supabase } from '../config/supabase';
import { fetchPendingOrders, acceptOrder, completeOrder } from '../services/partnerOrderService.js';

export default function DriverModePage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      setUserId(session.user.id);
    });
  }, [navigate]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPendingOrders(supabase, 'driver');
      setOrders(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    // Real-time subscription
    const channel = supabase
      .channel('driver-orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: "status=eq.pending"
      }, () => { loadOrders(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadOrders]);

  const handleAccept = async (orderId: string) => {
    try {
      await acceptOrder(supabase, orderId, userId, 'driver');
      toast.success('Pesanan diterima!');
      loadOrders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleComplete = async (orderId: string) => {
    try {
      await completeOrder(supabase, orderId);
      toast.success('Pesanan selesai!');
      loadOrders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-600 text-white sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/dashboard')} className="p-1 rounded-full hover:bg-blue-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-lg">Driver Mode</h1>
            <p className="text-blue-200 text-xs">WiraRide & WiraSend</p>
          </div>
          <button onClick={loadOrders} className="p-2 rounded-full hover:bg-blue-500">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm text-slate-600 font-medium">Online - Siap menerima pesanan</span>
        </div>

        {loading && orders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Memuat pesanan...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Belum ada pesanan masuk</p>
            <p className="text-sm mt-1">Pesanan ride & send akan muncul di sini</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 font-medium">{orders.length} pesanan menunggu</p>
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      order.service_type === 'ride' || order.service_type === 'WiraRide'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {order.service_type === 'ride' || order.service_type === 'WiraRide' ? '🚗 WiraRide' : '📦 WiraSend'}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(order.created_at).toLocaleTimeString('id-ID')}
                    </p>
                  </div>
                  <span className="font-bold text-emerald-600">
                    Rp {order.total_price?.toLocaleString('id-ID') || '0'}
                  </span>
                </div>

                <h3 className="font-semibold text-slate-800 mb-2">{order.title}</h3>

                <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                  <MapPin className="w-3 h-3" />
                  <span>{order.payment_method || 'cash'} · {order.payment_status || 'unpaid'}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(order.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Terima
                  </button>
                  <button
                    onClick={() => handleComplete(order.id)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
