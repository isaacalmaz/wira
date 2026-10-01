import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { pickupIcon, dropoffIcon, driverIcon } from '../components/common/WiraMap';
import toast from 'react-hot-toast';
import { ChevronLeft, Send, Phone, MessageSquare, MessageCircle, ShieldCheck, AlertCircle, Route, Bike, Package, UtensilsCrossed, Wrench, Waves, Star } from 'lucide-react';
import { Badge, Button, Card, IconTile, Money, Notice, Sheet, Spinner, cx } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useOrderDispatch } from '../hooks/useOrderDispatch';
import QrisOrderPayment from '../components/common/QrisOrderPayment';
import VisitExtras from '../components/common/VisitExtras';
import ReviewModal from '../components/common/ReviewModal';
import { canReview } from '../utils/review';
import { OrderStatus, getStatusKey } from '../constants/orderStatus';
import { fetchCounterpartyProfiles } from '../services/profileService';
import { useTranslation } from '../i18n';
import { localizeOrderTitle, localizePaymentMethod } from '../utils/localizeDbText';

// ---- display-only helpers ----
// Badge tone per DESIGN.md: searching/pending = warning, active = brand,
// completed = success, cancelled = danger.
const statusTone = (status) => {
  if (status === 'pending' || status === 'awaiting_payment') return 'warning';
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'brand';
};

const SERVICE_ICONS = { ride: Bike, send: Package, food: UtensilsCrossed, service: Wrench, pool: Waves };

// Pickup/destination names for the route summary, read from the order's
// details text (ride = JSON, send = the SendPage template). Returns null
// when the order has no route to show.
function routeFromOrder(order) {
  const raw = typeof order?.details === 'string' ? order.details : '';
  if (!raw) return null;
  if (raw.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.pickup && parsed?.dropoff) return { from: parsed.pickup.name, to: parsed.dropoff.name };
    } catch {
      // not JSON: fall through
    }
  }
  const m = raw.match(/^No\. Resi: (\S+) • (.+?) \((.+) ➔ (.+)\)$/s);
  if (m) return { from: m[3], to: m[4] };
  return null;
}

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
  const { t } = useTranslation();
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
  // UI only: the cancel confirmation sheet and the chat section anchor.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Re-evaluates the cancellation window (3 min / 20 min after acceptance)
  // while a partner is on the way.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const waitingForPickup = order && ['accepted', 'picking_up'].includes(order.status);
  useEffect(() => {
    if (!waitingForPickup) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [waitingForPickup]);
  const chatSectionRef = useRef(null);

  // Fetch Order Details
  const fetchOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, merchant:merchant_id(name, address)')
        .eq('id', id)
        .single();
      if (error) throw error;

      if (data?.driver_id) {
        const profiles = await fetchCounterpartyProfiles(supabase, [data.driver_id]);
        data.driver = profiles[data.driver_id] || null;
      }
      setOrder(data);

      if (data?.driver_id) {
        // Fetch initial driver loc
        const { data: dData } = await supabase.from('drivers').select('lat, lng, vehicle_plate').eq('id', data.driver_id).single();
        if (dData?.vehicle_plate) data.driver.plate_number = dData.vehicle_plate;
        if (dData?.lat && dData?.lng) setDriverLoc({ lat: dData.lat, lng: dData.lng });
      }
    } catch (err) {
      console.error(err);
      toast.error(t('order.load_failed', { message: err.message || err.toString() }));
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
        if (payload.new.status === 'completed') {
          // Stay on the page: it now asks for a review (0091).
          toast(t('order.completed_toast'));
        } else if (payload.new.status === 'cancelled') {
          toast(t('order.cancelled_toast'));
          setTimeout(() => navigate('/'), 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, navigate]);

  // QRIS orders: announce the payment once the DB moves the order on, and
  // poll as a fallback in case the realtime event is missed.
  const prevStatusRef = useRef(null);
  useEffect(() => {
    if (prevStatusRef.current === OrderStatus.AWAITING_PAYMENT && order?.status === OrderStatus.PENDING) {
      toast.success(t('order.qris_paid'));
    }
    prevStatusRef.current = order?.status ?? null;
  }, [order?.status]);

  useEffect(() => {
    if (order?.status !== OrderStatus.AWAITING_PAYMENT) return;
    const timer = setInterval(async () => {
      const { data } = await supabase.from('orders').select('status, payment_status').eq('id', id).maybeSingle();
      if (data) setOrder(prev => ({ ...prev, ...data }));
    }, 10000);
    return () => clearInterval(timer);
  }, [order?.status, id]);

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
      toast.error(t('order.chat_send_failed'));
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      const { error } = order.status === OrderStatus.AWAITING_PAYMENT
        ? await supabase.rpc('cancel_awaiting_qris_order', { p_order_id: id })
        : await supabase.rpc('wallet_refund_matched_ride', {
          p_order_id: id,
          p_description: 'Refund Batal Pelanggan (Dalam Grace Period)'
        });
      if (error) throw error;
      toast.success(t('order.cancel_success'));
    } catch (err) {
      console.error(err);
      toast.error(t('order.cancel_failed', { message: err.message }));
    } finally {
      setIsCancelling(false);
    }
  };

  // Mirrors wallet_refund_matched_ride (migrations/0088, visits 0089).
  // Rides/deliveries: free while pending, in the first 3 minutes after a
  // partner accepts, and again once 20 minutes pass without the pickup.
  // Technician visits: free while pending, in the first 3 minutes, until 2
  // hours before the visit, or once the technician is an hour late.
  const FREE_WINDOW_MS = 3 * 60 * 1000;
  const NO_SHOW_MS = 20 * 60 * 1000;
  const VISIT_LOCK_MS = 2 * 60 * 60 * 1000;
  const VISIT_LATE_MS = 60 * 60 * 1000;
  const isVisit = ['service', 'pool'].includes(order?.service_type);
  const scheduledMs = order?.scheduled_at ? new Date(order.scheduled_at).getTime() : null;
  const sinceAccept = order?.accepted_at ? nowTick - new Date(order.accepted_at).getTime() : null;
  const visitLate = scheduledMs != null && nowTick > scheduledMs + VISIT_LATE_MS;
  const isCancelable = () => {
    if (!order) return false;
    if (order.status === 'pending') return true;
    if (isVisit && ['accepted', 'on_the_way'].includes(order.status)) {
      if (sinceAccept != null && sinceAccept <= FREE_WINDOW_MS) return true;
      return scheduledMs == null || nowTick < scheduledMs - VISIT_LOCK_MS || visitLate;
    }
    if (!isVisit && ['accepted', 'picking_up'].includes(order.status)) {
      if (sinceAccept == null) return true; // fallback
      return sinceAccept <= FREE_WINDOW_MS || sinceAccept >= NO_SHOW_MS;
    }
    return false;
  };
  let cancelReopensAt = null;
  if (order && !isCancelable()) {
    if (isVisit && ['accepted', 'on_the_way'].includes(order.status) && scheduledMs != null) {
      cancelReopensAt = new Date(scheduledMs + VISIT_LATE_MS);
    } else if (!isVisit && ['accepted', 'picking_up'].includes(order.status) && sinceAccept != null) {
      cancelReopensAt = new Date(new Date(order.accepted_at).getTime() + NO_SHOW_MS);
    }
  }

  if (loading || !order) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-brand-ink">
        <Spinner size={28} />
      </div>
    );
  }

  const showMap = ['ride', 'send', 'food', 'service'].includes(order.service_type);

  // ---- display-only values (no effect on data or cancellation logic) ----
  const route = routeFromOrder(order);
  const distanceKm = order.distance_meters ? (Number(order.distance_meters) / 1000).toFixed(1) : null;
  // QRIS orders are paid out of the wallet too, so both are refunded there.
  const paidWithWallet = ['wallet', 'qris'].includes(order.payment_method) && order.payment_status === 'paid';
  const partnerName = order.driver?.name || t('chat.default_partner');
  const ServiceIcon = SERVICE_ICONS[order.service_type] || Route;
  const cancelDescription = order.status === 'pending'
    ? t('order.cancel_desc_pending')
    : isVisit
      ? (visitLate ? t('order.cancel_desc_visit_late') : t('order.cancel_desc_visit'))
      : sinceAccept != null && sinceAccept >= NO_SHOW_MS
        ? t('order.cancel_desc_late')
        : t('order.cancel_desc_accepted');
  const pinStatuses = isVisit ? ['accepted', 'on_the_way'] : ['accepted', 'picking_up'];
  const scheduledLabel = scheduledMs != null
    ? new Date(scheduledMs).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const openChat = () => chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const roundBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* Status header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          title={t('common.back')}
          aria-label={t('common.back')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink transition-colors hover:bg-sunken"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            {t(`order.service_title.${order.service_type}`)}
          </span>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance sm:text-2xl">{t('order.title')}</h1>
          <Badge tone={statusTone(order.status)} dot>{t(getStatusKey(order.status))}</Badge>
        </div>
      </div>

      {showMap && (
        <div className="relative h-56 shrink-0 overflow-hidden rounded-card border border-line bg-sunken sm:h-64">
          <MapContainer center={driverLoc || [-8.5833, 116.1167]} zoom={14} className="h-full w-full" zoomControl={false}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapBounds order={order} driverLoc={driverLoc} />
            {order.pickup_lat && order.pickup_lng && <Marker position={[order.pickup_lat, order.pickup_lng]} icon={pickupIcon} />}
            {order.dropoff_lat && order.dropoff_lng && <Marker position={[order.dropoff_lat, order.dropoff_lng]} icon={dropoffIcon} />}
            {driverLoc && <Marker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon} />}
          </MapContainer>
        </div>
      )}

      {order.status === OrderStatus.AWAITING_PAYMENT && (
        <div className="overflow-hidden rounded-card border border-line [&>div]:mb-0 [&>div]:border-b-0">
          <QrisOrderPayment order={order} onCancel={handleCancel} cancelling={isCancelling} />
        </div>
      )}

      {order.status === 'pending' && (
        <Card className="flex items-start gap-3.5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-warning-line bg-warning-soft text-warning">
            <Spinner size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[14px] font-semibold text-ink">{isVisit ? t('order.searching_technician') : t('order.searching_driver')}</p>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {isVisit
                ? t('order.visit_waiting')
                : totalCandidates > 0
                  ? t('order.dispatch_progress', { pinged: pingedCount, total: totalCandidates })
                  : t('order.dispatch_connecting')}
            </p>
          </div>
        </Card>
      )}

      {isVisit && scheduledLabel && !['completed', 'cancelled'].includes(order.status) && (
        <Notice tone="info">{t('order.visit_scheduled', { time: scheduledLabel })}</Notice>
      )}

      {pinStatuses.includes(order.status) && (
        order.service_type === 'food' ? (
          <Notice tone="info">{t('order.food_pin_note')}</Notice>
        ) : (
          <Card className="flex flex-col items-center gap-3 text-center">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <ShieldCheck size={17} className="shrink-0 text-brand-ink" aria-hidden="true" />
              {isVisit ? t('order.pin_label_visit') : t('order.pin_label')}
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
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner size={14} /> {t('order.pin_loading')}
              </p>
            )}
          </Card>
        )
      )}

      {order.driver && (
        <Card className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-[17px] font-bold text-brand-ink" aria-hidden="true">
            {partnerName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-[15px] font-bold text-ink">{order.driver.name}</p>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted">
              {order.driver.vehicle_type && <span className="capitalize">{order.driver.vehicle_type}</span>}
              {order.driver.vehicle_type && order.driver.plate_number && <span aria-hidden="true">·</span>}
              {order.driver.plate_number && (
                <span className="rounded-[6px] border border-line-strong bg-ground px-1.5 font-mono text-[12px] font-medium uppercase text-ink">
                  {order.driver.plate_number}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={openChat}
            title={t('order.chat_title')}
            aria-label={t('order.chat_title')}
            className={cx(roundBtn, 'border-brand-line bg-brand-soft text-brand-ink hover:brightness-[0.97]')}
          >
            <MessageCircle size={19} />
          </button>
          <a
            href={`tel:${order.driver.phone}`}
            title={t('order.call_driver')}
            aria-label={t('order.call_driver')}
            className={cx(roundBtn, 'border-brand bg-brand text-white hover:bg-brand-hover')}
          >
            <Phone size={19} />
          </a>
        </Card>
      )}

      {canReview(order) && (
        <Card className="flex flex-col items-center gap-3 border-2 border-pay-line text-center">
          <div className="flex gap-0.5 text-pay" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={22} className="fill-pay" />)}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-bold text-ink">{t('order.review_prompt_title')}</p>
            <p className="text-[13px] leading-relaxed text-ink-muted">{t('order.review_prompt_desc')}</p>
          </div>
          <Button block onClick={() => setReviewOpen(true)}>{t('activity.review_cta')}</Button>
        </Card>
      )}
      {reviewOpen && (
        <ReviewModal
          order={order}
          onClose={() => setReviewOpen(false)}
          onSuccess={() => setOrder((prev) => ({ ...prev, is_reviewed: true }))}
        />
      )}

      {isVisit && <VisitExtras order={order} />}

      {/* Order + route summary */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <IconTile tone="brand" size="sm"><ServiceIcon size={18} /></IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">{t(`order.service_title.${order.service_type}`)}</h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">{localizeOrderTitle(order, t)}</p>
          </div>
          <Money value={order.total_price} className="shrink-0 pt-0.5 text-[15px] font-medium text-ink" />
        </div>

        {route && (
          <>
            <div className="h-px bg-line" aria-hidden="true" />
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-[3px] pt-[5px]" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                <span className="h-5 w-px bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-[3px] bg-danger" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="truncate text-[14px] font-semibold text-ink">
                  <span className="sr-only">{t('activity.route_pickup')}: </span>{route.from || t('activity.route_pickup')}
                </p>
                <p className="truncate text-[14px] font-semibold text-ink">
                  <span className="sr-only">{t('activity.route_dropoff')}: </span>{route.to || t('activity.route_dropoff')}
                </p>
              </div>
              {distanceKm && (
                <span className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-xs text-ink-muted">{distanceKm} km</span>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-3 text-[13px]">
          <span className="flex-1 text-ink-muted">{t('activity.payment_label')}</span>
          <span className="font-semibold text-ink">{localizePaymentMethod(order, t)}</span>
        </div>
      </Card>

      {cancelReopensAt && (
        <p className="text-center text-[12.5px] leading-relaxed text-ink-muted">
          {t('order.cancel_available_at', {
            time: cancelReopensAt.toDateString() === new Date(nowTick).toDateString()
              ? cancelReopensAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : cancelReopensAt.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          })}
        </p>
      )}
      {isCancelable() && (
        <Button
          variant="danger-soft"
          size="lg"
          block
          onClick={() => setCancelOpen(true)}
          isLoading={isCancelling}
        >
          {isCancelling ? t('common.cancelling') : t('order.cancel_order')}
        </Button>
      )}

      {/* Chat */}
      <section ref={chatSectionRef} className="flex scroll-mt-20 flex-col overflow-hidden rounded-card border border-line bg-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <IconTile tone="brand" size="sm"><MessageSquare size={17} /></IconTile>
          <h3 className="min-w-0 flex-1 text-[15px] font-bold tracking-tight text-ink">{t('order.chat_title')}</h3>
        </div>
        <div className="flex max-h-80 min-h-[160px] flex-col gap-2.5 overflow-y-auto overscroll-contain bg-ground px-3 py-3" ref={chatRef}>
          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-6 py-6 text-center text-[13px] leading-relaxed text-ink-muted">
              {t('order.chat_empty')}
            </div>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2 text-sm leading-relaxed ${isMe ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink'}`}>
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
            placeholder={t('order.chat_placeholder')}
            aria-label={t('order.chat_placeholder')}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ground px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            title={t('chat.send')}
            aria-label={t('chat.send')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <Send size={17} />
          </button>
        </form>
      </section>

      {/* Cancel confirmation */}
      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        dismissible={!isCancelling}
        tone="danger"
        icon={<AlertCircle size={22} />}
        title={t('order.cancel_confirm_title')}
        description={cancelDescription}
        closeLabel={t('common.close')}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setCancelOpen(false)} disabled={isCancelling}>
              {t('order.cancel_keep')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              isLoading={isCancelling}
              onClick={async () => {
                await handleCancel();
                setCancelOpen(false);
              }}
            >
              {isCancelling ? t('common.cancelling') : t('order.cancel_order')}
            </Button>
          </>
        )}
      >
        {paidWithWallet ? (
          <div className="flex flex-col rounded-tile border border-line bg-card px-4">
            <div className="flex items-center gap-3 border-b border-line py-3">
              <span className="flex-1 text-[13px] text-ink-muted">
                {t('activity.payment_label')} · {localizePaymentMethod(order, t)}
              </span>
              <Money value={order.total_price} className="text-[13.5px] font-medium text-ink" />
            </div>
            <div className="flex items-center gap-3 py-3">
              <span className="flex-1 text-[13px] font-semibold text-ink">{t('ledger.refund')}</span>
              <Money value={order.total_price} sign="plus" tone="in" className="text-[15px] font-medium" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-tile border border-line bg-card px-4 py-3">
            <span className="flex-1 text-[13px] text-ink-muted">
              {t('activity.total_label')} · {localizePaymentMethod(order, t)}
            </span>
            <Money value={order.total_price} className="text-[13.5px] font-medium text-ink" />
          </div>
        )}
      </Sheet>
    </div>
  );
}
