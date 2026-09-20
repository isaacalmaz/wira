import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Phone, MessageSquare, Loader, MapPin, Navigation } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Icons for map
const driverIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: 'hue-rotate-[120deg]',
});

const defaultIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function ActiveOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [driverLoc, setDriverLoc] = useState(null);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const chatRef = useRef(null);

  // Fetch Order Details
  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, driver:driver_id(name, phone, vehicle_type, plate_number), merchant:merchant_id(name, address)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setOrder(data);

      if (data?.driver_id) {
        // Fetch initial driver loc
        const { data: dData } = await supabase.from('drivers').select('lat, lng').eq('id', data.driver_id).single();
        if (dData?.lat && dData?.lng) setDriverLoc({ lat: dData.lat, lng: dData.lng });
      }
    } catch (err) {
      console.error(err);
      toast.error('Pesanan tidak ditemukan');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Order realtime tracking
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`order_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (payload) => {
        setOrder(prev => ({ ...prev, ...payload.new }));
        if (['cancelled', 'completed'].includes(payload.new.status)) {
          toast(payload.new.status === 'completed' ? 'Pesanan Selesai!' : 'Pesanan Dibatalkan');
          setTimeout(() => navigate('/'), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, navigate]);

  // Driver location tracking
  useEffect(() => {
    if (!order?.driver_id || !['accepted', 'picking_up', 'in_trip'].includes(order.status)) return;
    const locChannel = supabase.channel(`driver_loc_${order.driver_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${order.driver_id}` }, (payload) => {
        if (payload.new.lat && payload.new.lng) {
          setDriverLoc({ lat: payload.new.lat, lng: payload.new.lng });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(locChannel); };
  }, [order?.driver_id, order?.status]);

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

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = { text: inputText.trim(), sender_id: user.id, sender_name: user.name, timestamp: Date.now() };
    const chatChannel = supabase.channel(`chat_${id}`);
    await chatChannel.send({ type: 'broadcast', event: 'message', payload: msg });
    setInputText('');
  };

  const handleCancel = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      if (order.status === 'pending') {
        const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc('wallet_refund_matched_ride', {
          p_order_id: id,
          p_description: 'Refund Batal Pelanggan (Dalam Grace Period)'
        });
        if (error) throw error;
      }
      toast.success('Pesanan berhasil dibatalkan');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal membatalkan pesanan');
    } finally {
      setIsCancelling(false);
    }
  };

  const isCancelable = () => {
    if (!order) return false;
    if (order.status === 'pending') return true;
    if (order.status === 'accepted') {
      if (!order.accepted_at) return true; // fallback
      const diff = Date.now() - new Date(order.accepted_at).getTime();
      return diff <= 180000; // 3 mins
    }
    return false;
  };

  if (loading || !order) {
    return <div className="flex h-screen items-center justify-center"><Loader className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  const showMap = ['ride', 'send', 'food', 'service'].includes(order.service_type);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-primary text-white p-4 flex items-center shadow-md shrink-0">
        <button onClick={() => navigate('/')} className="mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-lg font-bold flex-1">Status Pesanan</h1>
        <span className="capitalize font-semibold bg-white/20 px-2 py-1 rounded text-sm">{order.status.replace('_', ' ')}</span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {showMap && (
          <div className="h-64 shrink-0 relative bg-gray-200">
            <MapContainer center={driverLoc || [-8.5833, 116.1167]} zoom={14} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {driverLoc && <Marker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon} />}
            </MapContainer>
          </div>
        )}

        <div className="bg-white p-4 mb-2 shadow-sm shrink-0">
          <h2 className="font-bold text-lg mb-1 capitalize">Wira {order.service_type}</h2>
          <p className="text-gray-600 text-sm">{order.title}</p>
          <div className="font-bold text-primary mt-2">Rp {order.total_price?.toLocaleString('id-ID')}</div>
        </div>

        {order.driver && (
          <div className="bg-white p-4 mb-2 shadow-sm shrink-0 flex items-center justify-between">
            <div>
              <div className="font-bold">{order.driver.name}</div>
              <div className="text-sm text-gray-600">{order.driver.vehicle_type} • {order.driver.plate_number}</div>
            </div>
            <a href={`tel:${order.driver.phone}`} className="p-3 bg-green-100 text-green-600 rounded-full">
              <Phone size={20} />
            </a>
          </div>
        )}

        {isCancelable() && (
          <div className="p-4 shrink-0 bg-white shadow-sm mb-2">
            <button 
              onClick={handleCancel} 
              disabled={isCancelling}
              className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold border border-red-200"
            >
              {isCancelling ? 'Membatalkan...' : 'Batalkan Pesanan'}
            </button>
          </div>
        )}

        <div className="flex-1 bg-white shadow-sm p-4 flex flex-col">
          <h3 className="font-bold flex items-center gap-2 mb-3"><MessageSquare size={18}/> Live Chat</h3>
          <div className="flex-1 overflow-y-auto min-h-[150px] mb-3 space-y-3" ref={chatRef}>
            {messages.length === 0 && <div className="text-center text-gray-400 text-sm mt-4">Belum ada pesan</div>}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2 rounded-2xl max-w-[80%] ${m.sender_id === user?.id ? 'bg-primary text-white rounded-br-none' : 'bg-gray-100 rounded-bl-none'}`}>
                  {m.text}
                </div>
                <span className="text-[10px] text-gray-400 mt-1">
                  {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder="Ketik pesan..." 
              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-primary bg-gray-50"
            />
            <button type="submit" className="p-2 bg-primary text-white rounded-full"><Send size={18}/></button>
          </form>
        </div>
      </div>
    </div>
  );
}
