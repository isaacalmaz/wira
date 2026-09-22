import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Phone, MessageSquare, Loader, MapPin, Navigation } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrderDispatch } from '../hooks/useOrderDispatch';

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


function MapBounds({ order, driverLoc }) {
  const map = useMap();
  useEffect(() => {
    if (!order) return;
    const bounds = L.latLngBounds([]);
    if (order.pickup_lat && order.pickup_lng) bounds.extend([order.pickup_lat, order.pickup_lng]);
    if (order.dropoff_lat && order.dropoff_lng) bounds.extend([order.dropoff_lat, order.dropoff_lng]);
    if (driverLoc && driverLoc.lat && driverLoc.lng) bounds.extend([driverLoc.lat, driverLoc.lng]);
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [order, driverLoc, map]);
  return null;
}

export default function ActiveOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [driverLoc, setDriverLoc] = useState(null);
  // The real PIN, fetched separately from public.order_security_pins - the
  // orders.security_pin column no longer exists (migration 0067). RLS on
  // that table only returns a row to this order's real customer (or, for
  // food, the owning merchant), so this stays null until it loads.
  const [securityPin, setSecurityPin] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const { pingedCount, totalCandidates } = useOrderDispatch(order, session);
  const chatRef = useRef(null);

  // Fetch Order Details
  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, driver:driver_id(name, phone, vehicle_type), merchant:merchant_id(name, address)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setOrder(data);

      if (data?.driver_id) {
        // Fetch initial driver loc
        const { data: dData } = await supabase.from('drivers').select('lat, lng, vehicle_plate').eq('id', data.driver_id).single();
        if (dData?.vehicle_plate) data.driver.plate_number = dData.vehicle_plate;
        if (dData?.lat && dData?.lng) setDriverLoc({ lat: dData.lat, lng: dData.lng });
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat pesanan: ' + (err.message || err.toString()));
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase.from('order_security_pins').select('pin').eq('order_id', id).maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setSecurityPin(data.pin);
      });
    return () => { cancelled = true; };
  }, [id]);

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

  // Chat - backed by the real public.messages table (migration 0019's RLS
  // already scopes read/write to this order's real customer/driver/merchant
  // owner/admin) instead of the old bare Broadcast channel, which had no RLS
  // at all: anyone who knew the order id could join `chat_${id}` and read or
  // spoof messages. Loads history on mount, then subscribes to Postgres
  // Changes for new rows - RLS applies to that subscription the same way it
  // applies to a normal select, so a client not authorized for this order
  // never even receives the INSERT event.
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true });
      if (!cancelled && !error && data) setMessages(data);
    };
    loadMessages();

    const chatChannel = supabase
      .channel('messages_' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        setTimeout(() => {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }, 100);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(chatChannel); };
  }, [id, user]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !user) return;
    setInputText('');
    // RLS (migration 0019) already enforces that the sender must be a real
    // participant on this order - no client-side role check needed here.
    const { error } = await supabase.from('messages').insert({ order_id: id, sender_id: user.id, text });
    if (error) {
      console.error(error);
      toast.error('Gagal mengirim pesan');
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.rpc('wallet_refund_matched_ride', {
        p_order_id: id,
        p_description: 'Refund Batal Pelanggan (Dalam Grace Period)'
      });
      if (error) throw error;
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
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 -mx-4 md:-mx-0 -mt-4 md:-mt-0">
      <div className="bg-primary text-white p-4 flex items-center shadow-md shrink-0">
        <button onClick={() => navigate('/')} className="mr-3"><ArrowLeft size={24} /></button>
        <h1 className="text-lg font-bold flex-1">Status Pesanan</h1>
        <span className="capitalize font-semibold bg-white/20 px-2 py-1 rounded text-sm">{order.status.replace('_', ' ')}</span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {showMap && (
          <div className="h-64 shrink-0 relative bg-gray-200">
            <MapContainer center={driverLoc || [-8.5833, 116.1167]} zoom={14} className="h-full w-full" zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              <MapBounds order={order} driverLoc={driverLoc} />
              {order.pickup_lat && order.pickup_lng && <Marker position={[order.pickup_lat, order.pickup_lng]} icon={defaultIcon} />}
              {order.dropoff_lat && order.dropoff_lng && <Marker position={[order.dropoff_lat, order.dropoff_lng]} icon={defaultIcon} />}
              {driverLoc && <Marker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon} />}
            </MapContainer>
          </div>
        )}

        {['accepted', 'picking_up'].includes(order.status) && (
          <div className="bg-white dark:bg-slate-800 p-4 shrink-0 shadow-sm mb-2 border-b dark:border-slate-700 text-center">
            {order.service_type === 'food' ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Driver sedang mengambil pesanan di Restoran (PIN diverifikasi oleh Restoran)</p>
            ) : securityPin ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Berikan PIN ini kepada Driver saat bertemu:</p>
                <div className="text-3xl font-bold tracking-[0.3em] text-primary">{securityPin}</div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Memuat PIN...</p>
            )}
          </div>
        )}


        <div className="bg-white dark:bg-slate-800 p-4 mb-2 shadow-sm shrink-0 border-b dark:border-slate-700">
          <h2 className="font-bold text-lg mb-1 capitalize">Wira {order.service_type}</h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm">{order.title}</p>
          <div className="font-bold text-primary mt-2">Rp {order.total_price?.toLocaleString('id-ID')}</div>
        </div>

        {order.driver && (
          <div className="bg-white dark:bg-slate-800 p-4 mb-2 shadow-sm shrink-0 flex items-center justify-between border-b dark:border-slate-700">
            <div>
              <div className="font-bold">{order.driver.name}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{order.driver.vehicle_type} • {order.driver.plate_number}</div>
            </div>
            <a href={`tel:${order.driver.phone}`} className="p-3 bg-green-100 text-green-600 rounded-full">
              <Phone size={20} />
            </a>
          </div>
        )}

        {isCancelable() && (
          <div className="p-4 shrink-0 bg-white dark:bg-slate-800 shadow-sm mb-2">
            <button 
              onClick={handleCancel} 
              disabled={isCancelling}
              className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold border border-red-200"
            >
              {isCancelling ? 'Membatalkan...' : 'Batalkan Pesanan'}
            </button>
          </div>
        )}

        <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm p-4 flex flex-col">
          <h3 className="font-bold flex items-center gap-2 mb-3"><MessageSquare size={18}/> Live Chat</h3>
          <div className="flex-1 overflow-y-auto min-h-[150px] mb-3 space-y-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl" ref={chatRef}>
            {messages.length === 0 && <div className="text-center text-gray-400 text-xs mt-4">Belum ada pesan</div>}
            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm shadow-sm ${m.sender_id === user?.id ? 'bg-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 rounded-bl-none text-gray-800 dark:text-white'}`}>
                  {m.text}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5 px-1">
                  {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
            <button type="submit" disabled={!inputText.trim()} className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50 transition-colors"><Send size={16}/></button>
          </form>
        </div>
      </div>
    </div>
  );
}
