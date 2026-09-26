import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, BellRing, Target, Activity, Navigation2, PackageCheck, Car, Package, Utensils, Loader2 } from 'lucide-react';
import { Card, Button, Badge, Modal, StatTile } from '../../components/shared/UIComponents';
import OnlineToggle from '../../components/shared/OnlineToggle';
import EarningsCard from '../../components/shared/EarningsCard';
import WiraMap from '../../components/common/WiraMap';
import ChatModal from '../../components/common/ChatModal';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { OrderStatus } from '../../constants/orderStatus';
import {
  fetchPendingOrders, acceptOrder, claimDeliveryOrder, updateOrderStatus,
  subscribeToDriverOrders, updateDriverLocation, setDriverOffline, distanceMeters,
  driverEarnedAmount,
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
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id);

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
              toast.success('Ada pesanan menunggu!', { icon: '🔔' });
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
          toast.success('Pesanan Baru Masuk!', { icon: '🔔' });
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

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl">
      
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
          <div className="h-full w-full bg-slate-200 dark:bg-slate-700 flex flex-col items-center justify-center text-slate-400">
            <MapPin size={40} className="mb-2" />
            <p>Peta tidak aktif saat Offline</p>
          </div>
        )}
      </div>

      {/* Header Panel */}
      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
        <div className="max-w-2xl mx-auto flex justify-between items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 pointer-events-auto">
          <div>
            <h1 className="text-xl font-bold">Halo, {user?.name || 'Driver'}!</h1>
            <p className="text-sm text-slate-500">
              {activeOrder
                ? (activeOrder.status === OrderStatus.ACCEPTED ? 'Menuju lokasi jemputan...'
                  : activeOrder.status === OrderStatus.PICKING_UP ? 'Menjemput penumpang...'
                  : 'Dalam perjalanan ke tujuan...')
                : (isOnline ? 'Mencari pesanan...' : 'Anda offline')}
            </p>
          </div>
          {!activeOrder && (
            <div className="flex flex-col items-end">
              <OnlineToggle isOnline={isOnline} onChange={handleOnlineToggle} />
              <span className={`text-xs mt-1 font-medium ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 w-full z-10 bg-gradient-to-t from-slate-100 via-slate-100/80 to-transparent dark:from-slate-900 p-4 pb-6 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto mt-10">
          {!activeOrder ? (
            <div className="space-y-4">
              {!isOnline && (
                <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl p-3.5 shadow-lg">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Layanan yang Diterima</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'ride', label: 'Ride', icon: Car, color: 'blue' },
                      { id: 'send', label: isMobilDriver ? 'Kurir (Besar)' : 'Kurir', icon: Package, color: 'rose' },
                      ...(isMobilDriver ? [] : [{ id: 'food', label: 'Makanan', icon: Utensils, color: 'amber' }]),
                    ].map((jt) => {
                      const active = jobTypePrefs.includes(jt.id);
                      const Icon = jt.icon;
                      return (
                        <button
                          key={jt.id}
                          type="button"
                          disabled={isSavingJobType === jt.id}
                          onClick={() => handleToggleJobType(jt.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            active
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {isSavingJobType === jt.id ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                          {jt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl p-1 shadow-lg">
                <EarningsCard today={todayEarnings} week={weekEarnings} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <StatTile icon={Target} value={completedTrips} label="Trip Selesai" />
                <StatTile icon={Activity} value={completedTrips > 0 ? '100%' : '0%'} label="Tingkat Penerimaan" iconClassName="text-green-500" />
              </div>
            </div>
          ) : (
            <Card className="p-5 border-2 border-primary space-y-4 shadow-xl animate-in slide-in-from-bottom-5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pesanan Sedang Berjalan</h3>
                  <p className="text-sm text-slate-500">Order ID: {activeOrder.id.slice(0,8)}</p>
                </div>
              </div>
              <div className="flex justify-between items-center text-xl font-bold pt-2">
                <span>Total Tagihan:</span>
                <span className="text-primary">Rp {activeOrder.total_price.toLocaleString('id-ID')}</span>
              </div>

              {legTarget ? (
                <div className={`text-center text-xs font-semibold py-2 rounded-lg ${hasArrived ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400'}`}>
                  {hasArrived
                    ? `✅ Anda sudah sampai di ${legTarget.label}`
                    : legDistance != null
                      ? `📍 ~${legDistance < 1000 ? Math.round(legDistance) + ' m' : (legDistance / 1000).toFixed(1) + ' km'} menuju ${legTarget.label}`
                      : 'Mencari sinyal GPS...'}
                </div>
              ) : isFoodDelivery ? (
                // Restoran/merchant tidak punya koordinat sama sekali (lihat
                // migrations/0028), jadi tidak ada peta/jarak untuk food -
                // alamat teks apa adanya adalah satu-satunya panduan.
                <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 rounded-lg p-2.5">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeOrder.status === OrderStatus.PICKING_UP ? `Ambil di: ${activeOrder.title || 'Restoran'}` : 'Menuju alamat pelanggan'}
                  </p>
                  <p>{activeOrder.details}</p>
                </div>
              ) : null}

              <div className="flex gap-2">
                {legTarget && (
                  <Button
                    variant="outline"
                    className="w-full font-bold border-primary text-primary"
                    onClick={() => {
                      const origin = driverPos ? `${driverPos.lat},${driverPos.lng}` : '';
                      window.open(`https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin}` : ''}&destination=${legTarget.lat},${legTarget.lng}`, '_blank');
                    }}
                  >
                    Navigasi
                  </Button>
                )}
                <Button variant="outline" className="w-full font-bold border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300" onClick={() => navigate('active-order/' + activeOrder.id)}>
                  Chat
                </Button>
                {currentStep && (
                  <Button
                    variant="primary"
                    className={`w-full font-bold ${hasArrived ? 'animate-pulse' : ''}`}
                    onClick={handleAdvanceStage}
                  >
                    {currentStep.label}
                  </Button>
                )}
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
                  variant="outline"
                  disabled={isCancellingOrder}
                  className="w-full font-bold text-red-500 border-red-200 hover:bg-red-50 disabled:opacity-60"
                  onClick={handleCancelOrder}
                >
                  {isCancellingOrder ? 'Membatalkan...' : 'Batalkan Pesanan'}
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Incoming Order Popup */}
      {isOnline && incomingOrder && (
      <Modal
        isOpen={true}
        onClose={() => {}}
        closeOnBackdrop={false}
        className="max-w-sm p-6 border-2 border-primary relative overflow-hidden pointer-events-auto"
      >
            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                <BellRing size={32} className="animate-bounce" />
              </div>
              <Badge variant="primary" className="mb-2 capitalize">
                {incomingOrder.status === OrderStatus.READY ? 'Antar Makanan' : incomingOrder.service_type}
              </Badge>
              <h2 className="text-2xl font-bold">Rp {incomingOrder.total_price.toLocaleString('id-ID')}</h2>
              {incomingOrder.details && (() => {
                const incomingDetails = tryParseJson(incomingOrder.details);
                return incomingDetails ? (
                  <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-primary">{incomingDetails.pickup?.name || 'Lokasi Jemput'}</p>
                    <p className="text-xs">menuju</p>
                    <p className="font-semibold text-red-500">{incomingDetails.dropoff?.name || 'Tujuan'}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{incomingOrder.details}</p>
                );
              })()}
              <p className="text-slate-500 text-xs mt-3">Ketuk 'Terima' untuk melihat peta lengkap</p>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptOrder}>Terima</Button>
            </div>
      </Modal>
      )}

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