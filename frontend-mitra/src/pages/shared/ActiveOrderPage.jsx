import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Phone, MessageSquare, Loader } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Geolocation } from '@capacitor/geolocation';
import { updateOrderStatus, updateDriverLocation } from '../../services/orderService';

export default function ActiveOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const chatRef = useRef(null);

  const isDriver = order?.driver_id === user?.id;
  const isMerchant = order?.merchant_id === user?.id; // If villa/food, this user might be the merchant owner. Actually, orders table only has merchant_id which points to merchants table. The user.id is merchants.owner_id. We fetch it below.

  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customer:user_id(name, phone), merchant:merchant_id(owner_id)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setOrder(data);
    } catch (err) {
      console.error(err);
      toast.error('Pesanan tidak ditemukan');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Track order changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`order_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (payload) => {
        setOrder(prev => ({ ...prev, ...payload.new }));
        if (['cancelled', 'completed'].includes(payload.new.status)) {
          toast(payload.new.status === 'completed' ? 'Pesanan Selesai!' : 'Pesanan Dibatalkan');
          setTimeout(() => navigate(-1), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, navigate]);

  // Ephemeral Chat
  useEffect(() => {
    if (!id || !user) return;
    const chatChannel = supabase.channel(`chat_${id}`, { config: { broadcast: { self: true } } });
    chatChannel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        setMessages(prev => [...prev, payload]);
        setTimeout(() => {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }, 100);
      })
      .subscribe();
    return () => { supabase.removeChannel(chatChannel); };
  }, [id, user]);

  // Send Driver GPS every 5s
  useEffect(() => {
    let interval;
    if (order && isDriver && ['ride', 'send', 'food', 'service'].includes(order.service_type) && !['completed', 'cancelled'].includes(order.status)) {
      interval = setInterval(async () => {
        try {
          const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
          if (position?.coords) {
            await updateDriverLocation(supabase, user.id, position.coords.latitude, position.coords.longitude);
          }
        } catch (e) {
          console.error("GPS error", e);
        }
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [order, isDriver, user]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = { text: inputText.trim(), sender_id: user.id, sender_name: user.name, timestamp: Date.now() };
    const chatChannel = supabase.channel(`chat_${id}`);
    await chatChannel.send({ type: 'broadcast', event: 'message', payload: msg });
    setInputText('');
  };

  const getNextStageInfo = () => {
    if (!order) return null;
    const s = order.status;
    const type = order.service_type;

    if (type === 'ride' || type === 'send' || type === 'service') {
      if (s === 'accepted') return { label: 'Menuju Lokasi', next: 'picking_up' };
      if (s === 'picking_up') return { label: 'Mulai Perjalanan', next: 'in_trip' };
      if (s === 'in_trip') return { label: 'Selesaikan Pesanan', next: 'completed' };
    } else if (type === 'food') {
      // Driver side for food
      if (isDriver) {
        if (s === 'ready') return { label: 'Ambil Pesanan', next: 'delivering' };
        if (s === 'delivering') return { label: 'Selesaikan Pesanan', next: 'completed' };
      }
      // Merchant side for food
      if (order.merchant?.owner_id === user.id) {
        if (s === 'accepted') return { label: 'Siapkan Makanan', next: 'preparing' };
        if (s === 'preparing') return { label: 'Siap Diambil', next: 'ready' };
      }
    } else if (type === 'villa') {
      if (s === 'accepted' && order.merchant?.owner_id === user.id) return { label: 'Selesaikan Pesanan', next: 'completed' };
    }
    return null;
  };

  const advanceStage = async () => {
    const info = getNextStageInfo();
    if (!info) return;
    try {
      const updated = await updateOrderStatus(order.id, info.next);
      if (updated) setOrder(updated);
      toast.success(`Status diubah ke ${info.next}`);
    } catch (e) {
      console.error(e);
      toast.error('Gagal update status');
    }
  };

  if (loading || !order) {
    return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  const nextStageInfo = getNextStageInfo();
  const hasAccess = isDriver || order.merchant?.owner_id === user.id;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 -mx-4 md:-mx-8 -mt-4 md:-mt-8">
      <div className="bg-primary text-white p-4 flex items-center shadow-md shrink-0">
        <button onClick={() => navigate(-1)} className="mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-lg font-bold flex-1">Order #{order.id.slice(0,6)}</h1>
        <span className="capitalize font-semibold bg-white/20 px-2 py-1 rounded text-sm">{order.status.replace('_', ' ')}</span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col p-4 space-y-4">
        <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl">
          <h2 className="font-bold text-lg mb-1 capitalize">Wira {order.service_type}</h2>
          <p className="text-gray-600 text-sm">{order.title}</p>
          <div className="font-bold text-primary mt-2">Rp {order.total_price?.toLocaleString('id-ID')}</div>
        </div>

        {order.customer && (
          <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Pelanggan</div>
              <div className="font-bold">{order.customer.name}</div>
            </div>
            <a href={`tel:${order.customer.phone}`} className="p-3 bg-green-100 text-green-600 rounded-full">
              <Phone size={20} />
            </a>
          </div>
        )}

        {hasAccess && nextStageInfo && (
          <button className="w-full bg-primary text-white py-3 rounded-2xl font-bold" variant="primary"  onClick={advanceStage}>
            {nextStageInfo.label}
          </button>
        )}

        <div className="flex-1 bg-white shadow-sm p-4 rounded-xl flex flex-col min-h-[300px]">
          <h3 className="font-bold flex items-center gap-2 mb-3"><MessageSquare size={18}/> Live Chat (Customer)</h3>
          <div className="flex-1 overflow-y-auto mb-3 space-y-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl" ref={chatRef}>
            {messages.length === 0 && <div className="text-center text-gray-400 text-xs mt-4">Belum ada pesan</div>}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm shadow-sm ${m.sender_id === user?.id ? 'bg-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 rounded-bl-none text-gray-800 dark:text-white'}`}>
                  {m.text}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5 px-1">
                  {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 shrink-0">
            <input 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder="Ketik pesan..." 
              className="flex-1 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
            />
            <button type="submit" disabled={!inputText.trim()} className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50 hover:bg-primary-dark transition-colors"><Send size={16}/></button>
          </form>
        </div>
      </div>
    </div>
  );
}
