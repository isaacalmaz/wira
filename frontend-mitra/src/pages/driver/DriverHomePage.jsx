import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, BellRing, Target, Activity, Navigation2, PackageCheck, Car, Package, Utensils, Loader2, Wallet, MessageCircle, Check, CheckCircle2, Store } from 'lucide-react';
import { Button, Badge, Sheet, Money, IconTile, Stat, cx } from '../../components/ui';
import WiraMap from '../../components/common/WiraMap';
import ChatModal from '../../components/common/ChatModal';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';
import {
  fetchPendingOrders, acceptOrder, claimDeliveryOrder, updateOrderStatus,
  subscribeToDriverOrders, updateDriverLocation, setDriverOffline, distanceMeters,
  driverEarnedAmount,
  loadCommissionRates,
} from '../../services/orderService';

/** JSON.parse that never throws - ride/send's `details` is a JSON blob,
 * but food/villa/service's is a plain string, and a driver's incoming-order
 * queue can now show either shape. */
function tryParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

// Driver dianggap "sudah sampai" (tombol konfirmasi menyala) dalam radius ini.
// Tidak memblokir tombol di luar radius - hanya penanda visual, driver tetap
// bisa konfirmasi manual kapan saja (lihat rasional GPS-assisted-confirm).
const ARRIVAL_RADIUS_METERS = 150;

// ---- Presentational helpers (Tenun Laut) ----

/** A rupiah figure that can be negative (Tunai orders net the commission out
 * of the saldo), rounded the same way formatSignedRupiah does. */
const SignedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return <Money value={n} sign={n < 0 ? 'minus' : undefined} className={className} />;
};

/** The online/offline switch: a 44px touch target around a 48x28 track. */
const OnlineSwitch = ({ isOnline, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={isOnline}
    onClick={() => onChange(!isOnline)}
    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
  >
    <span className="sr-only">Toggle Online Status</span>
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-150',
        isOnline ? 'border-success bg-success' : 'border-line-strong bg-sunken',
      )}
    >
      <span
        className={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.3)] transition-transform duration-150',
          isOnline ? 'translate-x-[23px]' : 'translate-x-[3px]',
        )}
      />
    </span>
  </button>
);

/** Pickup (dot) to destination (square), each name wrapping freely. */
const RouteStops = ({ from, to }) => (
  <ol className="flex min-w-0 flex-1 flex-col">
    <li className="relative flex gap-3 pb-3">
      <span className="absolute bottom-0 left-[4.5px] top-[19px] w-px bg-line-strong" aria-hidden="true" />
      <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-[3px] ring-brand-soft" aria-hidden="true" />
      <p className="min-w-0 break-words text-[14px] font-semibold leading-snug text-ink">
        <span className="sr-only">Jemputan: </span>{from}
      </p>
    </li>
    <li className="flex gap-3">
      <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-[3px] bg-danger ring-[3px] ring-danger-soft" aria-hidden="true" />
      <p className="min-w-0 break-words text-[14px] font-semibold leading-snug text-ink">
        <span className="sr-only">Tujuan: </span>{to}
      </p>
    </li>
  </ol>
);

const formatKm = (meters) => `${(meters / 1000).toFixed(1).replace('.', ',')} km`;

const DriverHomePage = () => {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  // One unified Driver portal now (the separate /courier portal is gone) -
  // which incoming orders this driver may actually receive is entirely
  // driven by their own stored preferences (vehicle_type/job_type_preferences
  // on their users row), via orderService.js's single eligibility function
  // (eligibleServiceTypesForDriver/isOrderEligibleForDriver - "Option B",
  // see its doc comment) rather than which URL root they're mounted under.
  const driverPrefs = { vehicle_type: user?.vehicle_type, job_type_preferences: user?.job_type_preferences };
  const [isSavingJobType, setIsSavingJobType] = useState(null); // which job type is mid-save, if any
  const [isOnline, setIsOnline] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false); // Jika sedang menjalankan order
  const [customerName, setCustomerName] = useState('Penumpang');
  
  // Real stats state
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);
  // { offered, accepted } over the last 30 days from the dispatcher's offer
  // log (migrations/0087); null while loading or before that migration.
  const [acceptance, setAcceptance] = useState(null);

  const mataramPos = [-8.5833, 116.1167];

  // Posisi GPS terkini driver, dipakai untuk membatasi pesanan yang muncul ke
  // yang berjarak dekat saja (lihat useEffect pelacakan GPS di bawah). Ref,
  // bukan state, karena hanya dibaca saat query/realtime callback jalan -
  // tidak perlu memicu render ulang setiap detik.
  const driverPosRef = useRef(null);
  // Salinan driverPosRef sebagai state, hanya diperbarui bersamaan dengan
  // penulisan DB (tiap ~8 detik) - dipakai untuk menampilkan jarak-ke-tujuan
  // secara live tanpa re-render setiap detik.
  const [driverPos, setDriverPos] = useState(null);

  // Fetch real stats. Not eligibility-filtered - these are orders already
  // assigned to this driver (driver_id = user.id), regardless of which job
  // type they were when accepted, so a preference toggled off later doesn't
  // hide past earnings/trip history.
  useEffect(() => {
    const fetchDriverStats = async () => {
      if (!user) return;
      await loadCommissionRates(supabase);
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id);

      supabase.rpc('get_my_acceptance_rate', { p_days: 30 }).then(({ data: rate, error }) => {
        if (error) {
          if (error.code !== 'PGRST202') console.error('Acceptance rate error:', error);
          return;
        }
        const row = Array.isArray(rate) ? rate[0] : rate;
        if (row) setAcceptance({ offered: Number(row.offered) || 0, accepted: Number(row.accepted) || 0 });
      });

      if (data) {
        const completed = data.filter(d => d.status === 'completed');
        setCompletedTrips(completed.length);

        const todayStr = new Date().toLocaleDateString('id-ID');
        let tEarn = 0;
        let wEarn = 0;

        completed.forEach(c => {
          // Real driver share per migrations/0028's payout trigger, not raw
          // total_price - see driverEarnedAmount's doc comment.
          const price = driverEarnedAmount(c);
          if (new Date(c.created_at).toLocaleDateString('id-ID') === todayStr) {
            tEarn += price;
          }
          wEarn += price;
        });

        setTodayEarnings(tEarn);
        setWeekEarnings(wEarn);

        // Check active job on load
        const activeJob = data.find(d => [OrderStatus.ACCEPTED, OrderStatus.PICKING_UP, OrderStatus.IN_TRIP].includes(d.status));
        if (activeJob && !activeOrder) setActiveOrder(activeJob);
      }
    };
    fetchDriverStats();
  }, [user, activeOrder]);

  // Ambil nama asli penumpang untuk order aktif (sebelumnya selalu "Penumpang" generik di chat)
  useEffect(() => {
    if (!activeOrder?.user_id) {
      setCustomerName('Penumpang');
      return;
    }
    let cancelled = false;
    fetchCounterpartyProfiles(supabase, [activeOrder.user_id])
      .then((profiles) => {
        if (!cancelled) setCustomerName(profiles[activeOrder.user_id]?.name || 'Penumpang');
      });
    return () => { cancelled = true; };
  }, [activeOrder?.user_id]);

  useEffect(() => {
    if (!isOnline) {
      setIncomingOrder(null);
      return;
    }

    // Fungsi untuk mencari orderan yang menggantung (pending), difilter
    // ke service_type driver saja (ride/send) - sebelumnya query ini tidak
    // memfilter service_type sama sekali, jadi order food/villa/service bisa
    // muncul sebagai "pesanan masuk" untuk driver.
    const checkPendingOrders = async () => {
      if (activeOrder) return; // Jangan cari jika sedang sibuk
      try {
        const pending = await fetchPendingOrders(supabase, 'driver', null, driverPosRef.current, driverPrefs);
        const latest = pending[0];

        if (latest) {
          setIncomingOrder(prev => {
            if (!prev || prev.id !== latest.id) {
              toast.success('Ada pesanan menunggu!');
              return latest;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('checkPendingOrders failed:', err);
      }
    };

    // Cek langsung saat online/pertama kali buka
    checkPendingOrders();

    // Polling setiap 10 detik sebagai pelapis pengaman (fallback) dari WebSocket
    const interval = setInterval(() => {
      checkPendingOrders();
    }, 10000);

    // Dengarkan orderan baru dari tabel 'orders' via Realtime
    const unsubscribe = subscribeToDriverOrders(
      supabase,
      (order) => {
        if (!activeOrder) {
          setIncomingOrder(order);
          toast.success('Pesanan Baru Masuk!');
        }
      },
      () => driverPosRef.current,
      driverPrefs
    );

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, activeOrder, user?.vehicle_type, user?.job_type_preferences]);

  // Lacak lokasi GPS driver secara live ke public.drivers selama online, agar
  // pencarian driver terdekat (PostGIS) punya data nyata untuk dicari - tanpa
  // ini kolom lat/lng driver tidak pernah terisi sama sekali.
  useEffect(() => {
    if (!isOnline || !user) return;
    if (!navigator.geolocation) return;

    let lastSentAt = 0;
    let warnedPermission = false;
    // Debounce timeout/POSITION_UNAVAILABLE toasts separately from the
    // one-shot permission warning above - those two error codes are the
    // realistic "riding through an area with weak signal" case and can
    // legitimately recur many times a minute while GPS is flaky, so warn at
    // most once per window instead of either spamming every failed fix or
    // (the previous bug) never telling the driver at all beyond a
    // console.warn they'd never see.
    let lastUnavailableWarnAt = 0;
    const UNAVAILABLE_WARN_INTERVAL_MS = 30000;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        driverPosRef.current = { lat: position.coords.latitude, lng: position.coords.longitude };

        const now = Date.now();
        if (now - lastSentAt < 8000) return; // throttle: kirim maksimal tiap ~8 detik
        lastSentAt = now;
        setDriverPos(driverPosRef.current);
        updateDriverLocation(supabase, user.id, position.coords.latitude, position.coords.longitude)
          .catch((err) => console.warn('updateDriverLocation failed:', err.message));
      },
      (error) => {
        if (error.code === 1) {
          if (!warnedPermission) {
            warnedPermission = true;
            toast.error('Aktifkan izin lokasi agar Anda muncul di pencarian driver terdekat.');
          }
        } else if (error.code === 2 || error.code === 3) {
          // POSITION_UNAVAILABLE or TIMEOUT - the driver's live position has
          // silently stopped updating. Previously this only console.warn'd,
          // so a driver riding through a weak-signal area never found out.
          const now = Date.now();
          if (now - lastUnavailableWarnAt > UNAVAILABLE_WARN_INTERVAL_MS) {
            lastUnavailableWarnAt = now;
            toast.error('Sinyal GPS lemah - posisi Anda mungkin tidak ter-update. Periksa koneksi/GPS Anda.');
          }
        }
        console.warn('GPS tracking error:', error);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, user]);

  // Saat driver mematikan toggle atau meninggalkan halaman, tandai offline di DB.
  useEffect(() => {
    if (isOnline || !user) return;
    setDriverOffline(supabase, user.id).catch((err) => console.warn('setDriverOffline failed:', err.message));
  }, [isOnline, user]);

  useEffect(() => {
    return () => {
      if (user) {
        setDriverOffline(supabase, user.id).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // vehicle_type must be set before a driver can go online - job-type
  // eligibility (which orders they even see) depends on it, and there's no
  // safe "unknown vehicle" default to match orders against. Existing
  // pre-migration drivers are backfilled to 'motor' so this almost never
  // blocks anyone real; it only bites a brand-new/edge-case account that
  // hasn't set it yet, and points them straight at where to fix it.
  const handleOnlineToggle = (next) => {
    if (next && !user?.vehicle_type) {
      toast.error('Pilih kategori kendaraan Anda di Pengaturan Akun sebelum Online.');
      navigate('/driver/settings');
      return;
    }
    setIsOnline(next);
  };

  // Quick-access version of SettingsPage.jsx's job-type preference toggles,
  // right on Beranda where a driver actually decides what to receive before
  // going online - requested so they don't have to dig into Settings every
  // time. Writes straight to the same users.job_type_preferences column
  // Settings does (single source of truth, no separate local-only state to
  // drift out of sync), then refreshes AuthContext's profile in place
  // (refreshProfile) instead of a full page reload, since reloading here
  // would drop the GPS watcher / map state for what's meant to be a quick,
  // frequent toggle. 'food' is never offered for a mobil driver - matches
  // Settings' same hard restriction (migrations/0033).
  const jobTypePrefs = Array.isArray(user?.job_type_preferences) ? user.job_type_preferences : [];
  const isMobilDriver = user?.vehicle_type === 'mobil';

  const handleToggleJobType = async (jobType) => {
    if (!user) return;
    setIsSavingJobType(jobType);
    try {
      const next = jobTypePrefs.includes(jobType)
        ? jobTypePrefs.filter((t) => t !== jobType)
        : [...jobTypePrefs, jobType];
      // RLS trap (see AGENTS.md): an update blocked by RLS returns
      // error:null with 0 rows, which looks like success unless the
      // response array length is checked.
      const { error, data } = await supabase.from('users').update({ job_type_preferences: next }).eq('id', user.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau akun tidak ditemukan.');
      await refreshProfile();
    } catch (err) {
      toast.error(`Gagal memperbarui preferensi: ${err.message}`);
    } finally {
      setIsSavingJobType(null);
    }
  };

  const handleAcceptOrder = async () => {
    if (!incomingOrder || !user) return;
    try {
      // A food order surfaces to drivers already 'ready' (merchant handed
      // it off) rather than 'pending' (customer just placed it) - claim it
      // through the dedicated function instead of the generic accept path.
      const accepted = incomingOrder.status === OrderStatus.READY
        ? await claimDeliveryOrder(supabase, incomingOrder.id, user.id)
        : await acceptOrder(supabase, incomingOrder.id, user.id, 'driver');
      setActiveOrder(accepted);
      setIncomingOrder(null);
      toast.success('Berhasil mengambil pesanan!');
    } catch (err) {
      // Order was very likely taken by another driver first - this is expected
      // under the atomic accept guard, not a real error.
      toast.error('Pesanan sudah diambil mitra lain.');
      setIncomingOrder(null);
    }
  };

  // Tahapan perjalanan: ACCEPTED (menuju jemputan) -> PICKING_UP (konfirmasi
  // sampai, jemput penumpang) -> IN_TRIP (menuju tujuan) -> COMPLETED (selesai).
  // Sebelumnya UI ini langsung lompat ACCEPTED -> COMPLETED dengan satu tombol
  // "Selesai", padahal PICKING_UP/IN_TRIP sudah ada di state machine tapi
  // tidak pernah benar-benar dipakai di layar driver.
  const STAGE_FLOW = {
    [OrderStatus.ACCEPTED]: { next: OrderStatus.PICKING_UP, label: 'Konfirmasi Sampai di Jemputan', icon: MapPin },
    [OrderStatus.PICKING_UP]: { next: OrderStatus.IN_TRIP, label: 'Mulai Perjalanan', icon: Navigation2 },
    [OrderStatus.IN_TRIP]: { next: OrderStatus.COMPLETED, label: 'Selesaikan Perjalanan', icon: PackageCheck },
  };

  const handleAdvanceStage = async () => {
    if (!activeOrder) return;
    const step = STAGE_FLOW[activeOrder.status];
    if (!step) return;
    try {
      const updated = await updateOrderStatus(supabase, activeOrder.id, step.next, user.id, 'driver');
      if (step.next === OrderStatus.COMPLETED) {
        toast.success('Perjalanan diselesaikan!');
        setActiveOrder(null);
      } else {
        setActiveOrder(updated);
        toast.success(step.next === OrderStatus.PICKING_UP ? 'Sampai di lokasi jemputan' : 'Perjalanan dimulai');
      }
    } catch (err) {
      toast.error('Gagal memperbarui status pesanan');
    }
  };

  // Guards against a double-click firing two concurrent RPC calls, same
  // pattern as RidePage.jsx's isCancelling/isCancellingTrip on the customer
  // side.
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

  // Lets the driver cancel a ride they've already accepted but not yet
  // started (ACCEPTED/PICKING_UP only - the button is hidden once IN_TRIP,
  // same "can't back out once the trip has actually started" rule as the
  // customer side). Routes through the same wallet_refund_matched_ride RPC
  // RidePage.jsx's "Batalkan Perjalanan" uses (see
  // migrations/0047_cancel_matched_ride_refund_rpc.sql) rather than a plain
  // status update, so this stays one consistent code path for both sides.
  // As of migrations/0048_driver_cancel_requeues_ride.sql, a DRIVER calling
  // this RPC no longer just cancels the order outright - it resets it to
  // pending/driver_id=NULL so another nearby driver can pick it up, and the
  // customer's payment (if any) is left exactly as-is rather than refunded
  // (see that migration's header for the full reasoning: the ride isn't
  // actually cancelled, just re-matching). RidePage.jsx's realtime handler
  // picks up that status change on the customer's side and shows them a
  // "searching for a new driver" state instead of a dead order.
  const handleCancelOrder = async () => {
    if (!activeOrder || isCancellingOrder) return;
    setIsCancellingOrder(true);
    try {
      const { error } = await supabase.rpc('wallet_refund_matched_ride', {
        p_order_id: activeOrder.id,
        p_description: 'Dibatalkan oleh Driver',
      });
      if (error) throw error;
      toast.success('Pesanan dibatalkan, dicarikan driver lain untuk penumpang.');
      setActiveOrder(null);
    } catch (err) {
      toast.error(err.message || 'Gagal membatalkan pesanan');
    } finally {
      setIsCancellingOrder(false);
    }
  };

  // Target GPS saat ini tergantung tahap: menuju jemputan (ACCEPTED), sudah
  // di jemputan (PICKING_UP, tidak butuh jarak), atau menuju tujuan (IN_TRIP).
  const getCurrentLegTarget = () => {
    if (!activeOrder) return null;
    const pickup = activeOrder.pickup_lat != null && activeOrder.pickup_lng != null
      ? { lat: activeOrder.pickup_lat, lng: activeOrder.pickup_lng, label: 'lokasi jemputan' }
      : (orderDetails?.pickup?.lat != null ? { lat: orderDetails.pickup.lat, lng: orderDetails.pickup.lng, label: 'lokasi jemputan' } : null);
    const dropoff = activeOrder.dropoff_lat != null && activeOrder.dropoff_lng != null
      ? { lat: activeOrder.dropoff_lat, lng: activeOrder.dropoff_lng, label: 'tujuan' }
      : (orderDetails?.dropoff?.lat != null ? { lat: orderDetails.dropoff.lat, lng: orderDetails.dropoff.lng, label: 'tujuan' } : null);

    if (activeOrder.status === OrderStatus.ACCEPTED) return pickup;
    if (activeOrder.status === OrderStatus.IN_TRIP) return dropoff;
    return null;
  };

  const orderDetails = activeOrder ? tryParseJson(activeOrder.details) : null;
  const isFoodDelivery = !!activeOrder?.merchant_id;

  // Food orders' `details` is a plain string, not JSON (see tryParseJson's
  // doc comment above), so orderDetails is always null for food - but
  // activeOrder.dropoff_lat/lng ARE real coordinates for food orders
  // (unlike pickup, since a restaurant has no GPS data at all). Fall back to
  // those instead of collapsing straight to the generic Mataram pin, so the
  // in-app map is just as map-driven for the food delivery-to-customer leg
  // as it already is for ride/send - matching the "Navigasi" button below,
  // which already uses these same coordinates.
  const mapCenter = orderDetails?.pickup
    ? { lat: orderDetails.pickup.lat, lng: orderDetails.pickup.lng }
    : (activeOrder?.dropoff_lat != null
        ? { lat: activeOrder.dropoff_lat, lng: activeOrder.dropoff_lng }
        : { lat: mataramPos[0], lng: mataramPos[1] });
  const mapMarkers = orderDetails
    ? [
        { lat: orderDetails.pickup.lat, lng: orderDetails.pickup.lng, type: 'pickup', label: 'Jemputan' },
        { lat: orderDetails.dropoff.lat, lng: orderDetails.dropoff.lng, type: 'dropoff', label: 'Tujuan' },
        ...(driverPos ? [{ lat: driverPos.lat, lng: driverPos.lng, type: 'driver', label: 'Posisi Anda' }] : []),
      ]
    : (activeOrder?.dropoff_lat != null
        ? [
            { lat: activeOrder.dropoff_lat, lng: activeOrder.dropoff_lng, type: 'dropoff', label: 'Tujuan Pelanggan' },
            ...(driverPos ? [{ lat: driverPos.lat, lng: driverPos.lng, type: 'driver', label: 'Posisi Anda' }] : []),
          ]
        : [{ lat: mataramPos[0], lng: mataramPos[1] }]);

  const legTarget = getCurrentLegTarget();
  const legDistance = legTarget && driverPos
    ? distanceMeters(driverPos.lat, driverPos.lng, legTarget.lat, legTarget.lng)
    : null;
  const hasArrived = legDistance != null && legDistance <= ARRIVAL_RADIUS_METERS;
  const currentStep = activeOrder ? STAGE_FLOW[activeOrder.status] : null;

  const StepIcon = currentStep?.icon;
  // Incoming-order prompt: parsed route + straight-line trip distance
  // (display only, from the same coordinates the order already carries).
  const incomingDetails = incomingOrder?.details ? tryParseJson(incomingOrder.details) : null;
  const incomingTripMeters = incomingDetails?.pickup?.lat != null && incomingDetails?.dropoff?.lat != null
    ? distanceMeters(incomingDetails.pickup.lat, incomingDetails.pickup.lng, incomingDetails.dropoff.lat, incomingDetails.dropoff.lng)
    : null;

  const jobTypeOptions = [
    { id: 'ride', label: 'Ride', icon: Car },
    { id: 'send', label: isMobilDriver ? 'Kurir (Besar)' : 'Kurir', icon: Package },
    ...(isMobilDriver ? [] : [{ id: 'food', label: 'Makanan', icon: Utensils }]),
  ];

  return (
    <div className="relative -mx-4 -mt-4 h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] overflow-hidden bg-sunken md:mx-0 md:mt-0 md:h-[calc(100vh-4rem)] md:rounded-card md:border md:border-line [&_.leaflet-container]:rounded-none">

      {/* MAP AREA - FULL SCREEN */}
      <div className="absolute inset-0 z-0">
        {isOnline || activeOrder ? (
          <WiraMap
            center={mapCenter}
            zoom={orderDetails ? 14 : 14}
            markers={mapMarkers}
            route={orderDetails?.route}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-start gap-3 bg-sunken px-6 pt-36 text-center">
            <IconTile tone="neutral" size="lg"><MapPin size={24} /></IconTile>
            <p className="text-sm text-ink-muted">Peta tidak aktif saat Offline</p>
          </div>
        )}
      </div>

      {/* Header Panel: greeting + the online/offline control */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 md:inset-x-4 md:top-4">
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-card border border-line bg-card py-2.5 pl-4 pr-2 shadow-pop">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
            <h1 className="line-clamp-2 break-words text-[17px] font-extrabold leading-tight tracking-tight text-ink">Halo, {user?.name || 'Driver'}!</h1>
            <p className="text-[13px] leading-snug text-ink-muted">
              {activeOrder
                ? (activeOrder.status === OrderStatus.ACCEPTED ? 'Menuju lokasi jemputan...'
                  : activeOrder.status === OrderStatus.PICKING_UP ? 'Menjemput penumpang...'
                  : 'Dalam perjalanan ke tujuan...')
                : (isOnline ? 'Mencari pesanan...' : 'Anda offline')}
            </p>
          </div>
          {!activeOrder && (
            <div className="flex shrink-0 items-center gap-1">
              <Badge tone={isOnline ? 'success' : 'neutral'} dot>{isOnline ? 'Online' : 'Offline'}</Badge>
              <OnlineSwitch isOnline={isOnline} onChange={handleOnlineToggle} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel: a sheet over the map */}
      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[calc(100%-6.5rem)] max-w-2xl flex-col rounded-t-sheet bg-ground shadow-sheet md:bottom-4 md:rounded-sheet">
        <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 md:px-5 md:pb-5">
          {!activeOrder ? (
            <>
              {!isOnline && (
                <section className="flex flex-col gap-2" aria-labelledby="driver-job-types">
                  <p id="driver-job-types" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Layanan yang Diterima</p>
                  <div className="flex flex-wrap gap-2">
                    {jobTypeOptions.map((jt) => {
                      const active = jobTypePrefs.includes(jt.id);
                      const Icon = jt.icon;
                      return (
                        <button
                          key={jt.id}
                          type="button"
                          aria-pressed={active}
                          disabled={isSavingJobType === jt.id}
                          onClick={() => handleToggleJobType(jt.id)}
                          className={cx(
                            'inline-flex min-h-11 items-center gap-2 rounded-control border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60',
                            active
                              ? 'border-brand bg-brand-soft text-brand-ink'
                              : 'border-line bg-card text-ink-muted hover:border-line-strong',
                          )}
                        >
                          {isSavingJobType === jt.id ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                          {jt.label}
                          {active && <Check size={14} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              <Stat
                label="Pendapatan Hari Ini"
                value={<SignedMoney value={todayEarnings} />}
                icon={<Wallet size={18} />}
                tone="pay"
                hint={<>Minggu ini: <SignedMoney value={weekEarnings} className="font-medium text-ink" /></>}
              />
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Trip Selesai" value={completedTrips} icon={<Target size={18} />} />
                <Stat
                  label="Tingkat Penerimaan"
                  value={acceptance && acceptance.offered > 0 ? `${Math.round((acceptance.accepted / acceptance.offered) * 100)}%` : '—'}
                  icon={<Activity size={18} />}
                  tone="success"
                  hint={acceptance && acceptance.offered > 0
                    ? `${acceptance.accepted} dari ${acceptance.offered} tawaran, 30 hari`
                    : 'Belum ada tawaran 30 hari terakhir'}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <IconTile tone="brand"><MapPin size={20} /></IconTile>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 className="text-[16px] font-bold leading-snug tracking-tight text-ink text-balance">Pesanan Sedang Berjalan</h2>
                  <p className="text-[12px] text-ink-muted">Order ID: <span className="font-mono">{activeOrder.id.slice(0,8)}</span></p>
                </div>
                <Badge tone="brand" dot className="mt-0.5">{getDisplayStatus(activeOrder.status)}</Badge>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-card px-4 py-3">
                <span className="text-[13px] font-semibold text-ink-muted">Total Tagihan</span>
                <Money value={activeOrder.total_price} className="text-[20px] font-medium text-ink" />
              </div>

              {legTarget ? (
                hasArrived ? (
                  <div className="flex items-center gap-2.5 rounded-control border border-success-line bg-success-soft px-3.5 py-3 text-[13px] font-semibold text-success-ink">
                    <CheckCircle2 size={17} className="shrink-0" aria-hidden="true" />
                    <span>Anda sudah sampai di {legTarget.label}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-control border border-line bg-sunken px-3.5 py-3 text-[13px] text-ink-muted">
                    {legDistance != null
                      ? <Navigation2 size={17} className="shrink-0 text-brand-ink" aria-hidden="true" />
                      : <Loader2 size={17} className="shrink-0 animate-spin" aria-hidden="true" />}
                    {legDistance != null ? (
                      <span>
                        <span className="font-mono font-medium text-ink">~{legDistance < 1000 ? Math.round(legDistance) + ' m' : (legDistance / 1000).toFixed(1) + ' km'}</span>
                        {' '}menuju {legTarget.label}
                      </span>
                    ) : (
                      <span>Mencari sinyal GPS...</span>
                    )}
                  </div>
                )
              ) : isFoodDelivery ? (
                // Restoran/merchant tidak punya koordinat sama sekali (lihat
                // migrations/0028), jadi tidak ada peta/jarak untuk food -
                // alamat teks apa adanya adalah satu-satunya panduan.
                <div className="flex items-start gap-2.5 rounded-control border border-line bg-sunken px-3.5 py-3 text-[13px]">
                  <Store size={17} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-semibold text-ink">
                      {activeOrder.status === OrderStatus.PICKING_UP ? `Ambil di: ${activeOrder.title || 'Restoran'}` : 'Menuju alamat pelanggan'}
                    </p>
                    <p className="break-words leading-relaxed text-ink-muted">{activeOrder.details}</p>
                  </div>
                </div>
              ) : null}

              {/* Next step first: the one action the driver takes now */}
              {currentStep && (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  leftIcon={StepIcon ? <StepIcon size={19} /> : null}
                  onClick={handleAdvanceStage}
                >
                  {currentStep.label}
                </Button>
              )}

              <div className={cx('grid gap-2', legTarget ? 'grid-cols-2' : 'grid-cols-1')}>
                {legTarget && (
                  <Button
                    variant="secondary"
                    leftIcon={<Navigation2 size={17} />}
                    onClick={() => {
                      const origin = driverPos ? `${driverPos.lat},${driverPos.lng}` : '';
                      window.open(`https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin}` : ''}&destination=${legTarget.lat},${legTarget.lng}`, '_blank');
                    }}
                  >
                    Navigasi
                  </Button>
                )}
                <Button variant="secondary" leftIcon={<MessageCircle size={17} />} onClick={() => navigate('active-order/' + activeOrder.id)}>
                  Chat
                </Button>
              </div>

              {/* Batalkan Pesanan - hanya sebelum trip benar-benar dimulai
                  (ACCEPTED/PICKING_UP). Setelah IN_TRIP, RPC-nya menolak
                  (lihat migrations/0047) jadi disembunyikan di sini juga.
                  Dibatasi ke ride/send (bukan food/isFoodDelivery) sengaja -
                  order food yang sudah diklaim driver berarti merchant
                  mungkin sudah mulai menyiapkan makanan; membatalkan itu
                  adalah masalah dispatch/operasional tersendiri yang tidak
                  dianalisis di sini, jadi scope perubahan ini tetap di
                  ride/send seperti diminta, bukan diam-diam diperluas ke
                  food. (Secara uang tetap aman untuk food juga - trigger
                  payout merchant di migrations/0028 hanya jalan saat status
                  'completed', tidak pernah tercapai di sini - tapi ini
                  murni soal scope, bukan soal keamanan.) */}
              {activeOrder.status !== OrderStatus.IN_TRIP && !isFoodDelivery && (
                <Button
                  variant="ghost"
                  block
                  disabled={isCancellingOrder}
                  className="text-danger-ink hover:bg-danger-soft"
                  onClick={handleCancelOrder}
                >
                  {isCancellingOrder ? 'Membatalkan...' : 'Batalkan Pesanan'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Incoming Order Prompt */}
      <Sheet
        open={isOnline && !!incomingOrder}
        onClose={() => {}}
        dismissible={false}
        size="sm"
        icon={<BellRing size={22} />}
        title="Pesanan Baru Masuk"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setIncomingOrder(null)}>Tolak</Button>
            <Button variant="primary" size="lg" onClick={handleAcceptOrder}>Terima</Button>
          </>
        }
      >
        {incomingOrder && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3.5">
              <Badge tone="brand" className="capitalize">
                {incomingOrder.status === OrderStatus.READY ? 'Antar Makanan' : incomingOrder.service_type}
              </Badge>
              <Money value={incomingOrder.total_price} className="text-[24px] font-medium leading-none tracking-tight text-ink" />
            </div>

            {incomingOrder.details && (
              incomingDetails ? (
                <div className="flex items-start gap-3">
                  <RouteStops
                    from={incomingDetails.pickup?.name || 'Lokasi Jemput'}
                    to={incomingDetails.dropoff?.name || 'Tujuan'}
                  />
                  {incomingTripMeters != null && (
                    <span className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-[13px] font-medium text-ink-muted">{formatKm(incomingTripMeters)}</span>
                  )}
                </div>
              ) : (
                <p className="break-words text-sm leading-relaxed text-ink">{incomingOrder.details}</p>
              )
            )}

            <p className="text-xs text-ink-muted">Ketuk 'Terima' untuk melihat peta lengkap</p>
          </div>
        )}
      </Sheet>

      {isChatOpen && activeOrder && (
        <ChatModal
          orderId={activeOrder.id}
          onClose={() => setIsChatOpen(false)}
          receiverName={customerName}
        />
      )}
    </div>
  );
};

export default DriverHomePage;
