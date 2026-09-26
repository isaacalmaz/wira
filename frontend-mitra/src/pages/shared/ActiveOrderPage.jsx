import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import toast from 'react-hot-toast';
import { ArrowLeft, Send, Phone, MessageSquare, Loader, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Geolocation } from '@capacitor/geolocation';
import { updateOrderStatus, updateDriverLocation } from '../../services/orderService';
import { Modal } from '../../components/shared/UIComponents';


function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}
function deg2rad(deg) {
  return deg * (Math.PI/180)
}

export default function ActiveOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  // The real PIN, fetched separately from public.order_security_pins - the
  // orders.security_pin column no longer exists (migration 0067). RLS on
  // that table only returns a row for the order's real customer or, for
  // food orders, the owning merchant - never the driver, so this simply
  // stays null for a driver viewing their own active order.
  const [securityPin, setSecurityPin] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const chatRef = useRef(null);

  const isDriver = order?.driver_id === user?.id;

  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, merchant:merchant_id(owner_id)')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (data?.user_id) {
        const profiles = await fetchCounterpartyProfiles(supabase, [data.user_id]);
        data.customer = profiles[data.user_id] || null;
      }
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    supabase.from('order_security_pins').select('pin').eq('order_id', id).maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setSecurityPin(data.pin);
      });
    return () => { cancelled = true; };
  }, [id]);

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

    // PIN Verification to start trip
    if (info.next === 'in_trip' && ['ride', 'send', 'food', 'service'].includes(order.service_type)) {
       setShowPinModal(true);
       return;
    }

    // Sanity Checks to complete trip
    if (info.next === 'completed' && ['ride', 'send', 'food'].includes(order.service_type)) {
       try {
           toast.loading('Memverifikasi lokasi GPS...', { id: 'gps_check' });
           const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
           if (pos && pos.coords && order.dropoff_lat && order.dropoff_lng) {
              const dist = getDistanceFromLatLonInKm(pos.coords.latitude, pos.coords.longitude, order.dropoff_lat, order.dropoff_lng);
              if (dist > 0.15) { // 150 meters
                 toast.error('Gagal: Anda harus berada di radius 150m dari lokasi tujuan untuk menyelesaikan pesanan.', { id: 'gps_check' });
                 return;
              }
           }
           
           // Minimum time check (Speed max ~60km/h => 1 min per km)
           const elapsedMinutes = (Date.now() - new Date(order.updated_at).getTime()) / 60000;
           // Fallback to 0 if distance_meters is not available
           const routeDist = order.distance_meters ? (order.distance_meters / 1000) : 0; 
           const minTime = routeDist; // 1 min per km
           if (elapsedMinutes < minTime) {
               toast.error(`Gagal: Perjalanan terlalu singkat. Mohon tunggu ${Math.ceil(minTime - elapsedMinutes)} menit lagi.`, { id: 'gps_check' });
               return;
           }
           toast.success('Lokasi terverifikasi.', { id: 'gps_check' });
       } catch (err) {
           console.log("GPS check failed", err);
           toast.error('Tidak bisa memverifikasi lokasi Anda - aktifkan GPS dan coba lagi', { id: 'gps_check' });
           // Fail closed: a GPS error must block the action, not silently
           // let it through. Real server-side geofencing enforcement is a
           // separate, larger follow-up - this only closes the client-side
           // "GPS error lets you through" gap.
           return;
       }
    }

    try {
      const isMerchantAdvancing = !isDriver && order.merchant?.owner_id === user.id;
      const mode = isMerchantAdvancing ? 'merchant' : 'driver';
      const partnerId = isMerchantAdvancing ? order.merchant_id : user.id;
      const updated = await updateOrderStatus(supabase, order.id, info.next, partnerId, mode);
      if (updated) setOrder(updated);
      toast.success(`Status diubah ke ${info.next}`);
    } catch (e) {
      console.error(e);
      toast.error('Gagal update status');
    }
  };


  
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinInput.length !== 4) { toast.error("PIN harus 4 angka"); return; }
    setIsVerifying(true);
    setPinError('');
    try {
       const { data, error } = await supabase.rpc('start_order_with_pin', {
          p_order_id: order.id,
          p_pin_input: pinInput
       });
       if (error) throw error;
       if (!data.success) {
          setPinError(data.error || 'PIN Salah!');
          toast.error(data.error || 'PIN Salah!');
       } else {
          toast.success('PIN Benar! Pekerjaan dimulai.');
          setOrder(prev => ({...prev, status: 'in_trip'}));
          setShowPinModal(false);
          setPinInput('');
          setPinError('');
       }
    } catch(err) {
       setPinError(err.message);
       toast.error(err.message);
    }
    setIsVerifying(false);
  };

  const closePinModal = () => {
    if (isVerifying) return;
    setShowPinModal(false);
    setPinInput('');
    setPinError('');
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

        {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (
          <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl mb-2 text-center border-b dark:border-slate-700">
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Berikan PIN ini kepada Driver saat penyerahan makanan:</p>
             {securityPin ? (
               <div className="text-3xl font-bold tracking-[0.3em] text-primary">{securityPin}</div>
             ) : (
               <p className="text-sm text-gray-400">Memuat PIN...</p>
             )}
          </div>
        )}

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
            <button type="submit" disabled={!inputText.trim()} className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50 hover:bg-primary-dark transition-colors"><Send size={16}/></button>
          </form>
        </div>
      </div>

      {showPinModal && (
        <Modal isOpen={true} onClose={closePinModal} closeOnBackdrop={!isVerifying} className="max-w-sm p-6">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
              <Lock size={28} />
            </div>
            <h2 className="text-lg font-bold">Masukkan PIN Pesanan</h2>
            <p className="text-sm text-slate-500 mt-1">Minta 4 digit PIN dari pelanggan untuk memulai perjalanan.</p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="----"
              className="w-full text-center text-3xl tracking-[0.5em] font-bold border-2 border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl py-3 focus:outline-none focus:border-primary"
            />
            {pinError && <p className="text-sm text-red-500 text-center">{pinError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closePinModal}
                disabled={isVerifying}
                className="flex-1 py-3 rounded-2xl font-bold border-2 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isVerifying || pinInput.length !== 4}
                className="flex-1 bg-primary text-white py-3 rounded-2xl font-bold disabled:opacity-50"
              >
                {isVerifying ? 'Memverifikasi...' : 'Konfirmasi'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
