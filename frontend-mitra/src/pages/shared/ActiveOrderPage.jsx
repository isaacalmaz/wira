import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import toast from 'react-hot-toast';
import { ChevronLeft, Send, Phone, MessageSquare, Lock, ShieldCheck, Bike, Package, UtensilsCrossed, Wrench, Building2, Route, Waves, CalendarClock, MapPin, MessageSquareText, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Geolocation } from '@capacitor/geolocation';
import { updateOrderStatus, updateDriverLocation } from '../../services/orderService';
import { Badge, Button, Card, IconTile, Money, Sheet, Spinner, cx } from '../../components/ui';
import { getDisplayStatus } from '../../constants/orderStatus';
import { formatVisitTime, releaseJob, visitInfo } from '../../services/technicianService';
import VisitTools from '../../components/shared/VisitTools';


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

// ---- display-only helpers ----
// Badge tone per DESIGN.md: pending = warning, active = brand,
// completed = success, cancelled = danger.
const statusTone = (status) => {
  if (status === 'pending' || status === 'awaiting_payment') return 'warning';
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'brand';
};
const SERVICE_ICONS = { ride: Bike, send: Package, food: UtensilsCrossed, service: Wrench, pool: Waves, villa: Building2 };
const SERVICE_LABEL = { ride: 'WiraRide', send: 'WiraSend', food: 'WiraFood', service: 'WiraService', pool: 'WiraPool', villa: 'WiraVilla' };

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
  // Technician visits (service/pool): accepted -> on_the_way -> working
  // (customer PIN, migrations/0089) -> completed. No GPS tracking.
  const isVisit = ['service', 'pool'].includes(order?.service_type);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);

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
    if (order && isDriver && ['ride', 'send', 'food'].includes(order.service_type) && !['completed', 'cancelled'].includes(order.status)) {
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

    if (type === 'service' || type === 'pool') {
      if (!isDriver) return null;
      if (s === 'accepted') return { label: 'Berangkat ke Lokasi', next: 'on_the_way' };
      if (s === 'on_the_way') return { label: 'Mulai Bekerja (PIN Pelanggan)', next: 'working' };
      if (s === 'working') return { label: 'Pekerjaan Selesai', next: 'completed' };
    } else if (type === 'ride' || type === 'send') {
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
    if ((info.next === 'in_trip' && ['ride', 'send', 'food'].includes(order.service_type)) || info.next === 'working') {
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
      toast.success(`Status: ${getDisplayStatus(info.next)}`);
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
          toast.success(isVisit ? 'PIN benar. Selamat bekerja!' : 'PIN benar. Perjalanan dimulai.');
          setOrder(prev => ({...prev, status: data.status || 'in_trip'}));
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
    return (
      <div className="flex h-[60vh] items-center justify-center text-brand-ink">
        <Spinner size={28} label="Memuat" />
      </div>
    );
  }

  const nextStageInfo = getNextStageInfo();
  const hasAccess = isDriver || order.merchant?.owner_id === user.id;

  // ---- display-only values ----
  const ServiceIcon = SERVICE_ICONS[order.service_type] || Route;
  const customerInitial = (order.customer?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Kembali"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink transition-colors hover:bg-sunken"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{SERVICE_LABEL[order.service_type] || order.service_type}</span>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink sm:text-2xl">
            Order <span className="font-mono font-medium">#{order.id.slice(0,6)}</span>
          </h1>
          <Badge tone={statusTone(order.status)} dot>{getDisplayStatus(order.status)}</Badge>
        </div>
      </div>

      {/* Order summary */}
      <Card className="flex items-start gap-3">
        <IconTile tone="brand" size="sm"><ServiceIcon size={18} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">{SERVICE_LABEL[order.service_type] || order.service_type}</h2>
          <p className="break-words text-[13px] leading-relaxed text-ink-muted">{order.title}</p>
        </div>
        <Money value={order.total_price} className="shrink-0 pt-0.5 text-[15px] font-medium text-ink" />
      </Card>

      {isVisit && (() => {
        const v = visitInfo(order);
        return (
          <Card className="flex flex-col gap-2.5 text-[13.5px] text-ink">
            <p className="flex items-start gap-2.5">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="font-semibold">{v.when ? formatVisitTime(v.when) : 'Jadwal belum ditentukan'}</span>
            </p>
            {v.location && (
              <p className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="min-w-0 break-words">{v.location}</span>
              </p>
            )}
            {(v.complaint || v.size) && (
              <p className="flex items-start gap-2.5">
                <MessageSquareText size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="min-w-0 break-words">{v.complaint || `Ukuran kolam: ${v.size}`}</span>
              </p>
            )}
            {order.pickup_lat && order.pickup_lng && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.pickup_lat},${order.pickup_lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong px-4 text-[13.5px] font-semibold text-ink transition-colors hover:bg-sunken"
              >
                <Route size={16} aria-hidden="true" /> Buka Rute di Google Maps
              </a>
            )}
          </Card>
        );
      })()}

      {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <ShieldCheck size={17} className="shrink-0 text-brand-ink" aria-hidden="true" />
            Berikan PIN ini kepada Driver saat penyerahan makanan:
          </p>
          {securityPin ? (
            <div className="flex justify-center gap-2" aria-label={String(securityPin).split('').join(' ')}>
              {String(securityPin).split('').map((d, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="inline-flex h-14 w-12 items-center justify-center rounded-control border border-line-strong bg-ground font-mono text-[28px] font-medium text-ink"
                >
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-muted"><Spinner size={14} /> Memuat PIN...</p>
          )}
        </Card>
      )}

      {order.customer && (
        <Card className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-[17px] font-bold text-brand-ink" aria-hidden="true">
            {customerInitial}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-ink-muted">Pelanggan</span>
            <span className="truncate text-[15px] font-bold text-ink">{order.customer.name}</span>
          </div>
          <a
            href={`tel:${order.customer.phone}`}
            aria-label="Telepon pelanggan"
            title="Telepon pelanggan"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand bg-brand text-white transition-colors hover:bg-brand-hover"
          >
            <Phone size={19} />
          </a>
        </Card>
      )}

      {hasAccess && nextStageInfo && (
        <Button size="lg" block onClick={advanceStage}>
          {nextStageInfo.label}
        </Button>
      )}

      {isVisit && isDriver && <VisitTools order={order} onFinished={fetchOrder} />}

      {isVisit && isDriver && ['accepted', 'on_the_way'].includes(order.status) && (
        <Button variant="secondary" block leftIcon={<Undo2 size={17} />} onClick={() => setReleaseOpen(true)}>
          Lepaskan Pekerjaan
        </Button>
      )}

      {/* Chat */}
      <section className="flex flex-col overflow-hidden rounded-card border border-line bg-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <IconTile tone="brand" size="sm"><MessageSquare size={17} /></IconTile>
          <h3 className="min-w-0 flex-1 text-[15px] font-bold tracking-tight text-ink">Live Chat (Customer)</h3>
        </div>
        <div className="flex max-h-80 min-h-[180px] flex-col gap-2.5 overflow-y-auto overscroll-contain bg-ground px-3 py-3" ref={chatRef}>
          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-6 py-6 text-center text-[13px] text-ink-muted">Belum ada pesan</div>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            return (
              <div key={m.id} className={cx('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}>
                <div className={cx('max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2 text-sm leading-relaxed', isMe ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink')}>
                  {m.text}
                </div>
                <span className="px-1 font-mono text-[10.5px] text-ink-muted">
                  {new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            );
          })}
        </div>
        <form onSubmit={sendMessage} className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-3">
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ketik pesan..."
            aria-label="Ketik pesan..."
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ground px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Kirim"
            title="Kirim"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <Send size={17} />
          </button>
        </form>
      </section>

      <Sheet
        open={releaseOpen}
        onClose={() => { if (!releasing) setReleaseOpen(false); }}
        dismissible={!releasing}
        size="sm"
        tone="danger"
        icon={<Undo2 size={22} />}
        title="Lepaskan pekerjaan ini?"
        description="Pekerjaan kembali ke daftar Tersedia untuk teknisi lain. Kabari pelanggan lewat chat bila Anda sudah sempat menghubungi mereka."
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setReleaseOpen(false)} disabled={releasing}>Kembali</Button>
            <Button
              variant="danger"
              size="lg"
              isLoading={releasing}
              onClick={async () => {
                setReleasing(true);
                try {
                  await releaseJob(supabase, order.id);
                  toast.success('Pekerjaan dilepaskan');
                  navigate('/technician/orders', { replace: true });
                } catch (err) {
                  toast.error(err.message || 'Gagal melepaskan pekerjaan');
                } finally {
                  setReleasing(false);
                }
              }}
            >
              Lepaskan
            </Button>
          </>
        )}
      />

      <Sheet
        open={showPinModal}
        onClose={closePinModal}
        dismissible={!isVerifying}
        size="sm"
        icon={<Lock size={22} />}
        title="Masukkan PIN Pesanan"
        description={isVisit ? 'Minta 4 digit PIN dari pelanggan saat Anda tiba, untuk mulai bekerja.' : 'Minta 4 digit PIN dari pelanggan untuk memulai perjalanan.'}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={closePinModal} disabled={isVerifying}>
              Batal
            </Button>
            <Button
              type="submit"
              form="order-pin-form"
              size="lg"
              isLoading={isVerifying}
              disabled={pinInput.length !== 4}
            >
              {isVerifying ? 'Memverifikasi...' : 'Konfirmasi'}
            </Button>
          </>
        )}
      >
        <form id="order-pin-form" onSubmit={handlePinSubmit} className="flex flex-col gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            autoComplete="one-time-code"
            aria-label="PIN Pesanan"
            aria-invalid={!!pinError}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="----"
            className={cx(
              'block w-full rounded-control border-2 bg-card py-3 pl-[0.5em] text-center font-mono text-[32px] font-medium tracking-[0.5em] text-ink placeholder:text-ink-muted/50 focus:ring-2',
              pinError ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-line-strong focus:border-brand focus:ring-brand/20',
            )}
          />
          {pinError && <p className="text-center text-sm text-danger-ink">{pinError}</p>}
        </form>
      </Sheet>
    </div>
  );
}
