import { useState, useEffect } from 'react';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import SavedAddressPicker from '../components/common/SavedAddressPicker';
import ChatModal from '../components/common/ChatModal';
import {
  MapPin,
  Navigation,
  Car,
  Shield,
  Phone,
  MessageSquare,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  LocateFixed,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import API_BASE_URL from '../config/api';

export default function RidePage() {
  const { balance, pay, refund, refundMatchedRide } = useWallet();
  const { addOrder, updateOrderStatus } = useOrders();

  const [step, setStep] = useState('input'); // input, vehicle, searching, tracking, completed
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('WiraPay'); // 'WiraPay' or 'Tunai'
  const [rating, setRating] = useState(5);
  // Guards the "Batalkan Pencarian" button against a double-click firing two
  // concurrent refund() calls - see migrations/0040_wallet_refund_rpc.sql
  // for the matching server-side idempotency guard.
  const [isCancelling, setIsCancelling] = useState(false);
  // Same double-click guard, for the separate "Batalkan Perjalanan" button
  // in the tracking step (step === 'tracking', after a driver has already
  // been matched) - see migrations/0047_cancel_matched_ride_refund_rpc.sql.
  const [isCancellingTrip, setIsCancellingTrip] = useState(false);

  // Status perjalanan aktif
  const [tripStage, setTripStage] = useState(0); 
  // 0: Driver menuju lokasi (3 menit)
  // 1: Driver tiba di penjemputan
  // 2: Dalam perjalanan menuju tujuan
  // 3: Selesai perjalanan

  const [vehicles, setVehicles] = useState([]);
  
  useEffect(() => {
    const fetchVehicles = async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('service_type', 'ride')
        .eq('is_active', true)
        .order('price', { ascending: true });
        
      if (data) {
        setVehicles(data.map(v => ({
          id: v.type,
          name: v.name,
          basePrice: v.price, // Store original for calculation
          price: v.price,
          perKmRate: v.per_km_rate,
          time: v.duration,
          icon: v.type === 'motor' ? '🛵' : (v.type === 'mobil' ? '🚗' : '🚙'),
          desc: `Kapasitas: ${v.capacity} orang`
        })));
      }
    };
    fetchVehicles();
  }, []);

  // Data Driver riil yang menerima pesanan
  const [driverInfo, setDriverInfo] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [mapState, setMapState] = useState({
    center: { lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng },
    zoom: 14,
    markers: [{ lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng }],
    route: null
  });
  const [isSearching, setIsSearching] = useState(false);

  const [routeInfo, setRouteInfo] = useState(null);

  const handleLocateMe = (idx = 0) => {
    if (!navigator.geolocation) {
      toast.error('Browser Anda tidak mendukung fitur lokasi');
      return;
    }
    
    const toastId = toast.loading('Mencari lokasi Anda...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        
        // Update map
        setMapState(prev => {
          const newMarkers = [...prev.markers];
          if (idx === 1 && newMarkers.length < 2) newMarkers.push(latLng);
          else newMarkers[idx] = latLng;
          return { ...prev, center: latLng, zoom: 19, markers: newMarkers };
        });

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
          const data = await res.json();
          if (data && data.display_name) {
            const name = data.display_name.split(',')[0];
            if (idx === 0) setPickup(name);
            else setDropoff(name);
          }
        } catch (e) {
          console.error(e);
        }
        
        toast.success('Lokasi ditemukan!', { id: toastId });
      },
      (error) => {
        console.error("GPS Error:", error);
        let errorMsg = 'Gagal mendapatkan lokasi.';
        if (error.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
        else if (error.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
        else if (error.code === 3) errorMsg = 'Pencarian lokasi timeout. Sinyal GPS lemah.';
        toast.error(errorMsg, { id: toastId, duration: 6000 });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // Otomatis mencari rute jika marker 0 dan 1 sudah ada (pickup & dropoff valid)
  useEffect(() => {
    if (mapState.markers.length === 2 && pickup && dropoff && step === 'input') {
      const getRoute = async () => {
        setIsSearching(true);
        const { fetchRoute } = await import('../utils/osmHelpers');
        const routeData = await fetchRoute(mapState.markers[0], mapState.markers[1]);
        if (routeData) {
          setMapState(prev => ({ ...prev, route: routeData.coordinates, zoom: 14 }));
          setRouteInfo({
            distance: routeData.distance, // in meters
            duration: routeData.duration  // in seconds
          });
        }
        setIsSearching(false);
      };
      getRoute();
    }
  }, [mapState.markers, pickup, dropoff, step]);

  const defaultVehicles = [
    { id: 'motor', name: 'WiraRide Motor', basePrice: 12000, price: 12000, icon: '🛵', desc: 'Kapasitas: 1 orang' },
    { id: 'mobil', name: 'WiraRide Mobil', basePrice: 25000, price: 25000, icon: '🚗', desc: 'Kapasitas: 4 orang' }
  ];

  const sourceVehicles = vehicles.length > 0 ? vehicles : defaultVehicles;

  const dynamicVehicles = sourceVehicles.map(v => {
    if (!routeInfo) return v;
    const distKm = routeInfo.distance / 1000;
    const extraKm = Math.max(0, distKm - 2);
    const perKmRate = v.perKmRate || (v.id === 'motor' ? 3000 : 5000);
    const dynamicPrice = (v.basePrice || v.price || 15000) + Math.ceil(extraKm * perKmRate);
    const estMins = Math.ceil(routeInfo.duration / 60);
    return { ...v, price: dynamicPrice, time: `~${estMins} mnt` };
  });

  const handleLanjut = () => {
    if (!pickup || !dropoff) {
      toast.error('Mohon isi titik jemput dan tujuan Anda');
      return;
    }
    if (dynamicVehicles.length > 0) {
      setSelectedVehicle(dynamicVehicles[0]);
    }
    setStep('vehicle');
  };

  const [activeOrderId, setActiveOrderId] = useState(null);
  const [assignedDriverId, setAssignedDriverId] = useState(null);
  const [nearbyDriverCount, setNearbyDriverCount] = useState(null);

  // Promo/kupon state for the vehicle-selection step. These were previously
  // referenced (handleCheckPromo, calculateFinalPrice) without ever being
  // declared, which crashed every render of the 'vehicle' step in
  // production (calculateFinalPrice() is called unconditionally on line
  // ~600's "Pesan Sekarang" button).
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError('');
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .eq('code', promoCode.toUpperCase().trim())
        .single();
      
      if (error || !data) throw new Error('Kode promo tidak ditemukan');
      if (data.status !== 'Active') throw new Error('Promo sudah tidak aktif');
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error('Promo sudah kadaluarsa');
      if (data.service_type && data.service_type !== 'ride') throw new Error('Promo tidak berlaku untuk layanan ini');
      
      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  
  const calculateFinalPrice = () => {
    const basePrice = selectedVehicle?.price || 15000;
    if (!activePromo) return basePrice;
    
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    } else {
      return Math.max(0, basePrice - activePromo.discount);
    }
  };

  const handleStartBooking = async () => {
    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error('Saldo WiraPay tidak cukup, silakan gunakan Tunai atau Top Up dulu');
      return;
    }

    try {
      const pickupLat = mapState.markers[0]?.lat;
      const pickupLng = mapState.markers[0]?.lng;
      const dropoffLat = mapState.markers[1]?.lat;
      const dropoffLng = mapState.markers[1]?.lng;

      // Cek ketersediaan driter terdekat secara real (PostGIS nearest-neighbor),
      // hanya untuk memberi info jujur ke pelanggan - tidak memblokir pemesanan,
      // karena driver baru bisa online kapan saja setelah ini.
      // `nearbyDrivers` is kept (not just the count) so the push-notification
      // fan-out below can reuse this exact same lookup as its target list -
      // no second nearest-driver query.
      let driverCount = null;
      let nearbyDrivers = [];
      if (pickupLat != null && pickupLng != null) {
        const { data: nearby } = await supabase.rpc('get_nearest_drivers', {
          user_lat: pickupLat,
          user_lng: pickupLng,
          target_vehicle_type: selectedVehicle?.id || null,
          only_online: true,
          max_results: 5
        });
        driverCount = nearby?.length || 0;
        nearbyDrivers = nearby || [];
      }
      setNearbyDriverCount(driverCount);

      const orderDetails = JSON.stringify({
        pickup: { name: pickup, lat: pickupLat, lng: pickupLng },
        dropoff: { name: dropoff, lat: mapState.markers[1]?.lat, lng: mapState.markers[1]?.lng },
        route: mapState.route
      });

      // Debit the wallet BEFORE creating the order, not after the trip
      // completes - previously the debit only ran in handleCompleteTrip,
      // which depends on this browser tab staying open with an active
      // realtime subscription all the way to 'completed'. If the tab
      // closed early, the driver still got paid via the DB payout trigger
      // but the customer's wallet was never actually charged (same bug
      // class fixed for WiraFood in RestaurantPage.jsx). pay() throws on
      // insufficient funds/RPC error and shows its own toast, so a failure
      // here aborts before the order is ever created.
      if (paymentMethod === 'WiraPay') {
        await pay(finalPrice, `WiraRide ke ${dropoff}`);
      }

      const order = await addOrder({
        serviceType: 'ride',
        title: `Perjalanan ke ${dropoff}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        details: orderDetails,
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        // Structured pricing inputs for the server-side trigger
        // (migrations/0059): rateCode must equal vehicles.type - the
        // vehicles fetch above maps `id: v.type`, so selectedVehicle.id IS
        // vehicles.type (e.g. 'motor'/'mobil'), not a UI label.
        rateCode: selectedVehicle?.id || null,
        distanceMeters: routeInfo?.distance ?? null,
        promoCode: activePromo?.code || null,
      });

      // Only count the promo as "used" once it's actually attached to a
      // real, created order - not just when the code was validated - so a
      // promo can't be reserved by someone who never completes checkout.
      if (activePromo?.id) {
        supabase.rpc('increment_promo_usage', { promo_id: activePromo.id }).then(({ error: usageErr }) => {
          if (usageErr) console.error('Gagal mencatat pemakaian promo:', usageErr);
        });
      }

      setActiveOrderId(order.id);
      setStep('searching');

      // Notify nearby available drivers a new Ride order exists, reusing
      // `nearbyDrivers` computed above (no second lookup) - fired only now,
      // after the order actually exists, so a driver never gets alerted
      // about an order that failed to create (e.g. pay() throwing on
      // insufficient balance, aborted before this point). The single-target
      // /api/notifications/order-alert endpoint (backend/routes/
      // notification.routes.js) only notifies one user per call, but a new
      // ride is potentially relevant to several nearby drivers at once - so
      // this loops it once per driver in nearbyDrivers (already capped to 5
      // by max_results above, so this can't turn into a notification storm).
      // A dedicated fan-out endpoint that does its own nearby-driver lookup
      // server-side would be cleaner, but reusing the existing single-target
      // endpoint from the client is the appropriately-scoped choice for
      // tonight given it's a one-line loop over data already in hand.
      // Best-effort: failures here (missing fcm_token, network hiccup) must
      // never surface as an error to the customer or affect their booking.
      if (nearbyDrivers.length > 0) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          nearbyDrivers.forEach((d) => {
            fetch(`${API_BASE_URL}/notifications/order-alert`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                userId: d.id,
                title: 'Pesanan WiraRide Baru!',
                body: `Ada penumpang di dekat Anda menuju ${dropoff}.`,
                data: { orderId: order.id, type: 'new_ride_order' },
              }),
            }).catch((err) => console.error('order-alert (nearby driver) failed:', err));
          });
        });
      }

      if (driverCount === 0) {
        toast.error('Saat ini belum ada driver WiraRide terdekat yang online, tapi pesanan Anda tetap kami carikan.', { duration: 6000 });
      } else {
        toast.success('Mencari driver di sekitar Anda...');
      }
    } catch (err) {
      toast.error(`Gagal: ${err.message}`);
    }
  };

  // Efek Real-time untuk mendengarkan perubahan status dari Admin / Driver
  useEffect(() => {
    if (!activeOrderId) return;

    const channel = supabase
      .channel(`order_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrderId}` },
        async (payload) => {
          const newStatus = payload.new.status;
          
          if (newStatus === 'accepted') {
            // Ambil data asli Driver dari database
            if (payload.new.driver_id) {
              setAssignedDriverId(payload.new.driver_id);
              
              const { data: driverUser } = await supabase.from('users').select('name, phone, email').eq('id', payload.new.driver_id).maybeSingle();
              const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
              let regInfo = null;
              if (flagsData && Array.isArray(flagsData.features)) {
                regInfo = flagsData.features.find(f => f.auth_id === payload.new.driver_id || f.email === driverUser?.email);
              }
              setDriverInfo({
                name: driverUser?.name || 'Mitra Driver Wira',
                phone: driverUser?.phone || '-',
                vehicle: regInfo?.vehicle || 'Sepeda Motor Wira',
                plate: regInfo?.plate || 'DR WIRA',
                rating: 5.0,
              });

              // Ambil koordinat awal driver agar langsung muncul di peta
              const { data: driverLoc } = await supabase.from('drivers').select('lat, lng').eq('id', payload.new.driver_id).maybeSingle();
              if (driverLoc && driverLoc.lat && driverLoc.lng) {
                setMapState(prev => {
                  const newMarkers = [...prev.markers];
                  newMarkers[2] = { lat: driverLoc.lat, lng: driverLoc.lng, type: 'driver', label: 'Driver Anda' };
                  return { ...prev, markers: newMarkers };
                });
              }
            }

            setStep('tracking');
            setTripStage(0);
            toast.success(`Driver Ditemukan!`, { icon: '🛵', duration: 4000 });
          }
          else if (newStatus === 'picking_up') {
            setTripStage(1);
          }
          else if (newStatus === 'in_trip') {
            setTripStage(2);
          }
          else if (newStatus === 'completed') {
            handleCompleteTrip();
          }
          else if (newStatus === 'pending' && !payload.new.driver_id) {
            // Driver-initiated cancel-and-requeue
            // (migrations/0048_driver_cancel_requeues_ride.sql):
            // wallet_refund_matched_ride's driver branch resets the order to
            // pending/driver_id=NULL instead of destroying it, so this SAME
            // order can be picked up by another nearby driver instead of
            // forcing the customer to book again. This UPDATE can only ever
            // arrive here as "my driver bailed" - the order's initial
            // pending state is set by an INSERT at booking time (never seen
            // by this handler, which only listens for UPDATE events), and
            // every other status transition in this app moves forward
            // (pending -> accepted -> picking_up -> in_trip -> completed) or
            // sideways to 'cancelled', never back to 'pending' any other
            // way. No `step` check is needed to disambiguate it - and
            // checking the `step` state variable here would be unreliable
            // anyway, since this effect only re-subscribes when
            // activeOrderId changes, so its closure holds whatever `step`
            // was at that moment, not the live value.
            setStep('searching');
            setTripStage(0);
            setAssignedDriverId(null);
            setDriverInfo(null);
            // Drop the driver marker (index 2) added by the 'accepted'
            // branch above - pickup/dropoff markers (0/1) stay put so the
            // map doesn't reset while a new driver is searched.
            setMapState(prev => ({ ...prev, markers: prev.markers.slice(0, 2) }));
            toast.error('Driver membatalkan perjalanan Anda, sedang mencari driver baru...', { icon: '🔄', duration: 6000 });

            // Re-notify nearby drivers that this order is open again,
            // reusing the exact same get_nearest_drivers + POST
            // /notifications/order-alert fan-out handleStartBooking already
            // uses for a brand-new booking (see its comment further up this
            // file) - fired from here (the customer's browser, which
            // already has API_BASE_URL/session context in this exact shape)
            // rather than from the cancelling driver's app, per this
            // feature's design: the driver who just bailed shouldn't be the
            // one re-broadcasting the order to their peers.
            const requeuedOrder = payload.new;
            if (requeuedOrder.pickup_lat != null && requeuedOrder.pickup_lng != null) {
              const { data: nearby } = await supabase.rpc('get_nearest_drivers', {
                user_lat: requeuedOrder.pickup_lat,
                user_lng: requeuedOrder.pickup_lng,
                target_vehicle_type: selectedVehicle?.id || null,
                only_online: true,
                max_results: 5,
              });
              if (nearby?.length > 0) {
                supabase.auth.getSession().then(({ data: { session } }) => {
                  if (!session?.access_token) return;
                  nearby.forEach((d) => {
                    fetch(`${API_BASE_URL}/notifications/order-alert`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        userId: d.id,
                        title: 'Pesanan WiraRide Menunggu Driver Baru!',
                        body: `Penumpang di dekat Anda butuh driver baru menuju ${dropoff}.`,
                        data: { orderId: requeuedOrder.id, type: 'requeued_ride_order' },
                      }),
                    }).catch((err) => console.error('order-alert (requeue nearby driver) failed:', err));
                  });
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  // Efek Real-time untuk melacak pergerakan GPS Driver (Tracking)
  useEffect(() => {
    if (!assignedDriverId || step !== 'tracking') return;

    const channel = supabase
      .channel(`driver_track_${assignedDriverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${assignedDriverId}` },
        (payload) => {
          const { lat, lng } = payload.new;
          if (lat && lng) {
            setMapState(prev => {
              const newMarkers = [...prev.markers];
              newMarkers[2] = { lat, lng, type: 'driver', label: 'Driver Anda' };
              return { ...prev, markers: newMarkers };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assignedDriverId, step]);



  const handleCompleteTrip = () => {
    // Payment already happened up-front in handleStartBooking now - calling
    // pay() here again would double-charge the customer. This is just UI
    // reset once the order reaches 'completed'.
    setStep('completed');
    toast.success('Perjalanan Anda telah selesai!');
  };

  // Cancels an already-matched ride (driver accepted, tripStage 0 or 1 -
  // i.e. order.status 'accepted'/'picking_up') via the SECURITY DEFINER
  // wallet_refund_matched_ride RPC - see
  // migrations/0047_cancel_matched_ride_refund_rpc.sql for the full
  // eligibility/refund policy. Guarded by isCancellingTrip the same way
  // "Batalkan Pencarian" is guarded by isCancelling above, against a
  // double-click firing two concurrent RPC calls (the RPC itself is also
  // idempotent server-side, but the UI guard avoids a redundant second
  // network round-trip / confusing double error toast).
  const handleCancelTrip = async () => {
    if (isCancellingTrip || !activeOrderId) return;
    setIsCancellingTrip(true);
    try {
      await refundMatchedRide(activeOrderId, 'Refund Pembatalan Perjalanan (Sudah Matched)');
      toast.success('Perjalanan dibatalkan.');
      setStep('input');
      setActiveOrderId(null);
      setAssignedDriverId(null);
      setDriverInfo(null);
      setPickup('');
      setDropoff('');
      setRouteInfo(null);
      setMapState(prev => ({
        ...prev,
        route: null,
        markers: [{ lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng }]
      }));
    } catch (err) {
      toast.error(`Gagal membatalkan perjalanan: ${err.message}`);
    } finally {
      setIsCancellingTrip(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Area Peta Interaktif */}
      <div className="absolute inset-0 z-0 bg-slate-200">
        <WiraMap 
          center={mapState.center} 
          zoom={mapState.zoom} 
          markers={mapState.markers}
          route={mapState.route}
          onMarkerDragEnd={async (idx, latLng) => {
            setMapState(prev => {
              const newMarkers = [...prev.markers];
              // Ensure we have two markers if we are dragging the second one
              if (idx === 1 && newMarkers.length < 2) {
                newMarkers[1] = latLng;
              } else {
                newMarkers[idx] = latLng;
              }
              // Center on the moved marker
              return { ...prev, center: latLng, markers: newMarkers };
            });

            // Reverse geocode
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latLng.lat}&lon=${latLng.lng}`);
              const data = await res.json();
              if (data && data.display_name) {
                const shortName = data.display_name.split(',')[0];
                if (idx === 0) setPickup(shortName);
                if (idx === 1) setDropoff(shortName);
              }
            } catch (e) {
              console.error(e);
            }
          }}
        />

        {/* Input Terapung jika langkah awal */}
        {step === 'input' && (
          <div className="absolute top-3 left-3 right-3 md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-6 md:w-[28rem] z-[400] max-w-md mx-auto md:mx-0">
            <Card className="p-3.5 space-y-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl border border-slate-200 dark:border-slate-700 !overflow-visible">
              <LocationAutocomplete
                placeholder="Lokasi Penjemputan Anda (cth: Ampenan / Rumah)"
                icon={Navigation}
                iconColor="text-blue-500"
                value={pickup}
                onChange={setPickup}
                onSelect={(loc) => {
                  setMapState(prev => ({ ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19 }));
                }}
              />
              <div className="flex items-center justify-between pr-1 mt-[-4px] mb-2">
                <SavedAddressPicker
                  onSelect={({ address, lat, lng }) => {
                    setPickup(address);
                    setMapState(prev => {
                      const newMarkers = [...prev.markers];
                      newMarkers[0] = { lat, lng };
                      return { ...prev, center: { lat, lng }, zoom: 19, markers: newMarkers };
                    });
                  }}
                />
                <button
                  onClick={() => handleLocateMe(0)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark"
                >
                  <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
                </button>
              </div>

              <LocationAutocomplete
                placeholder="Mau ke mana? (cth: Epicentrum Mall / Senggigi)"
                icon={MapPin}
                iconColor="text-red-500"
                value={dropoff}
                onChange={setDropoff}
                onSelect={(loc) => {
                  setMapState(prev => {
                    const newMarkers = [...prev.markers];
                    newMarkers[1] = { lat: loc.lat, lng: loc.lng };
                    return { ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19, markers: newMarkers };
                  });
                }}
              />
              <div className="flex items-center justify-between pr-1 mt-[-4px]">
                <SavedAddressPicker
                  onSelect={({ address, lat, lng }) => {
                    setDropoff(address);
                    setMapState(prev => {
                      const newMarkers = [...prev.markers];
                      newMarkers[1] = { lat, lng };
                      return { ...prev, center: { lat, lng }, zoom: 19, markers: newMarkers };
                    });
                  }}
                />
                <button
                  onClick={() => handleLocateMe(1)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:text-red-600"
                >
                  <LocateFixed size={12} /> Gunakan Lokasi Saat Ini
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Bagian Bawah: Aksi & Langkah Pemesanan */}
      <div className="absolute bottom-0 w-full md:w-[28rem] md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:rounded-3xl z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t md:border border-white/20 dark:border-slate-700/50 flex flex-col max-h-[75vh]">
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto my-3 shrink-0"></div>
        <div className="flex-1 overflow-y-auto pb-6">
        {/* LANGKAH 1: PILIH TUJUAN CEPAT */}
        {step === 'input' && (
          <div className="p-5 space-y-3">
            {routeInfo && (
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Navigation size={14} className="text-primary" /> Jarak Tempuh
                </span>
                <span className="text-sm font-bold text-slate-800 dark:text-white">
                  {(routeInfo.distance / 1000).toFixed(1)} km
                </span>
              </div>
            )}
            <Button
              className="w-full py-3 font-bold text-sm shadow-md"
              onClick={handleLanjut}
              disabled={!pickup || !dropoff || isSearching || !routeInfo}
            >
              {isSearching ? 'Menghitung Rute...' : 'Lanjut Pilih Kendaraan'} <ArrowRight size={16} className="ml-1 inline" />
            </Button>
          </div>
        )}

        {/* LANGKAH 2: PILIH KENDARAAN & METODE BAYAR */}
        {step === 'vehicle' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Pilih Kendaraan
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-xs">
                  {pickup} ➔ {dropoff}
                </p>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full text-slate-600 dark:text-slate-300 font-medium">
                Jarak {routeInfo ? `± ${(routeInfo.distance / 1000).toFixed(1)} km` : ''}
              </span>
            </div>

            <div className="space-y-2">
              {dynamicVehicles.map((v) => {
                const isSelected = selectedVehicle?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVehicle(v)}
                    className={`flex items-center justify-between p-3 rounded-2xl border-2 cursor-pointer transition ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{v.icon}</span>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {v.name}
                        </h4>
                        <p className="text-[11px] text-slate-500">{v.desc}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {formatRupiah(v.price)}
                      </span>
                      <p className="text-[10px] text-slate-400">{v.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kode Promo */}
            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl space-y-2">
              {activePromo ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-green-600 dark:text-green-400">
                    Promo "{activePromo.code}" diterapkan
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 font-semibold"
                    onClick={() => {
                      setActivePromo(null);
                      setPromoCode('');
                      setPromoError('');
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Kode Promo (opsional)"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white uppercase font-bold"
                  />
                  <Button
                    variant="outline"
                    className="text-xs px-3"
                    onClick={handleCheckPromo}
                    disabled={checkingPromo || !promoCode.trim()}
                  >
                    {checkingPromo ? '...' : 'Pakai'}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="text-[11px] text-red-500 font-semibold">{promoError}</p>
              )}
            </div>

            {/* Metode Pembayaran */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Metode Pembayaran:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('WiraPay')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    paymentMethod === 'WiraPay'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  WiraPay ({formatRupiah(balance)})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Tunai')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    paymentMethod === 'Tunai'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Tunai (COD)
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setStep('input')}
              >
                Ganti Rute
              </Button>
              <Button
                className="flex-1 font-bold text-xs sm:text-sm"
                onClick={handleStartBooking}
              >
                Pesan Sekarang • {formatRupiah(calculateFinalPrice())}
              </Button>
            </div>
          </div>
        )}

        {/* LANGKAH 3: MENCARI DRIVER */}
        {step === 'searching' && (
          <div className="p-8 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xl">
                {selectedVehicle?.icon || '🛵'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Mencarikan Driver Terdekat...
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {nearbyDriverCount > 0
                  ? `${nearbyDriverCount} driver ditemukan di sekitar lokasi jemput Anda, menunggu salah satu menerima.`
                  : nearbyDriverCount === 0
                  ? 'Belum ada driver online di sekitar Anda saat ini. Pesanan tetap menunggu jika ada driver yang online.'
                  : 'Sistem Wira sedang menghubungkan pesanan Anda dengan mitra driver di sekitar Mataram.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isCancelling}
              className="text-red-500 border-red-200 hover:bg-red-50 disabled:opacity-60"
              onClick={async () => {
                if (isCancelling) return; // guard against a double-click firing two concurrent refund() calls
                setIsCancelling(true);
                try {
                  if (paymentMethod === 'WiraPay' && activeOrderId) {
                    // wallet_refund now takes the order id and computes the
                    // refund amount server-side from orders.total_price
                    // (which already reflects any promo discount applied at
                    // booking time via finalPrice/calculateFinalPrice) -
                    // see migrations/0040_wallet_refund_rpc.sql. It also
                    // marks the order 'cancelled' itself, atomically with
                    // the credit, so the updateOrderStatus call below is
                    // only needed for the cash-payment path.
                    await refund(activeOrderId, 'Refund Batal WiraRide');
                  } else if (activeOrderId) {
                    await updateOrderStatus(activeOrderId, 'cancelled');
                  }
                  setStep('vehicle');
                } catch (err) {
                  toast.error(`Gagal membatalkan: ${err.message}`);
                } finally {
                  setIsCancelling(false);
                }
              }}
            >
              {isCancelling ? 'Membatalkan...' : 'Batalkan Pencarian'}
            </Button>
          </div>
        )}

        {/* LANGKAH 4: DRIVER DITEMUKAN & LIVE TRACKING */}
        {step === 'tracking' && (
          <div className="p-5 space-y-4">
            {/* Status Perjalanan */}
            <div className="bg-primary/10 dark:bg-primary/20 p-3 rounded-2xl flex items-center justify-between border border-primary/20">
              <div className="flex items-center gap-2.5">
                <span className="animate-pulse w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-xs sm:text-sm font-bold text-primary dark:text-primary-light">
                  {tripStage === 0 && 'Menunggu driver mulai bergerak...'}
                  {tripStage === 1 && 'Driver Sedang Menuju Titik Jemput'}
                  {tripStage === 2 && 'Dalam Perjalanan Menuju Tujuan'}
                </span>
              </div>
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                {paymentMethod}
              </span>
            </div>

            {/* Kartu Profil Driver */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-lg shadow-sm">
                  👨‍✈️
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1">
                    {driverInfo?.name || 'Mitra Driver Wira'}
                    <span className="text-[10px] text-amber-500 flex items-center font-bold">
                      ⭐ {driverInfo?.rating || '5.0'}
                    </span>
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {driverInfo?.plate || 'DR WIRA'}
                  </p>
                  <p className="text-[11px] text-slate-500">{driverInfo?.vehicle || 'Sepeda Motor'}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={`tel:${driverInfo?.phone || ''}`}
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-full text-green-600 shadow-sm border border-slate-200 dark:border-slate-700 hover:scale-105 transition"
                  title="Telepon Driver"
                >
                  <Phone size={16} />
                </a>
                <button
                  onClick={() => setIsChatOpen(true)}
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-full text-primary shadow-sm border border-slate-200 dark:border-slate-700 hover:scale-105 transition"
                  title="Kirim Pesan"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>

            {/* Tombol Konfirmasi Tiba */}
            <Button
              className="w-full py-3 font-bold bg-primary hover:bg-primary-dark text-white shadow-md"
              onClick={handleCompleteTrip}
            >
              Konfirmasi Tiba di Tujuan
            </Button>

            {/* Batalkan Perjalanan - hanya sebelum driver benar-benar
                menjemput (tripStage 0/1, order.status 'accepted'/
                'picking_up'). Setelah IN_TRIP (tripStage 2) RPC-nya menolak
                (lihat migrations/0047), jadi tombolnya disembunyikan di
                titik itu daripada memunculkan aksi yang pasti gagal. */}
            {tripStage < 2 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isCancellingTrip}
                className="w-full text-red-500 border-red-200 hover:bg-red-50 disabled:opacity-60"
                onClick={handleCancelTrip}
              >
                {isCancellingTrip ? 'Membatalkan...' : 'Batalkan Perjalanan'}
              </Button>
            )}
          </div>
        )}

        {/* LANGKAH 5: SELESAI PERJALANAN & RATING */}
        {step === 'completed' && (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 text-green-600 rounded-full mx-auto flex items-center justify-center">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Perjalanan Selesai!
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Terima kasih telah bepergian dengan Wira
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl text-left text-xs space-y-2 border border-slate-100 dark:border-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-400">Rute:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {pickup} ➔ {dropoff}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Biaya:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatRupiah(selectedVehicle?.price || 15000)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Beri Nilai Driver:
              </p>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 transition hover:scale-125"
                  >
                    <Star
                      size={32}
                      className={
                        star <= rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }
                    />
                  </button>
                ))}
              </div>
              
              <textarea
                id="reviewComment"
                placeholder="Bagaimana pelayanan driver kami? (Opsional)"
                className="w-full bg-slate-50 dark:bg-slate-800 text-sm p-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary h-20 resize-none"
              ></textarea>
            </div>

            <Button
              className="w-full py-3 font-bold"
              onClick={async () => {
                if (rating > 0 && assignedDriverId && activeOrderId) {
                  const comment = document.getElementById('reviewComment')?.value || '';
                  // Writes through the same submit_review_and_tip RPC as
                  // ActivityPage/ReviewModal.jsx instead of inserting into
                  // the old, disconnected driver_reviews table - keeps this
                  // immediate post-trip prompt as one of two entry points
                  // into ONE review system (public.reviews), so a rating
                  // given here also sets orders.is_reviewed and actually
                  // counts toward the driver's displayed average rating.
                  // No tip field in this quick prompt (ReviewModal already
                  // offers that from Aktivitas), so tip amount is always 0.
                  const { error } = await supabase.rpc('submit_review_and_tip', {
                    p_order_id: activeOrderId,
                    p_rating: rating,
                    p_review_text: comment,
                    p_tip_amount: 0,
                  });
                  if (!error) {
                    toast.success('Terima kasih atas penilaian Anda!');
                  } else if (error.message?.includes('already been reviewed')) {
                    // Already reviewed via Aktivitas/ReviewModal in the
                    // meantime - not an error from the customer's POV.
                  } else {
                    toast.error(error.message || 'Gagal mengirim ulasan');
                  }
                }
                setStep('input');
                setPickup('');
                setDropoff('');
                setActiveOrderId(null);
                setAssignedDriverId(null);
                setRating(0);
                setMapState(prev => ({
                  ...prev,
                  route: null,
                  markers: [{ lat: APP_CONFIG.defaultLocation.lat, lng: APP_CONFIG.defaultLocation.lng }]
                }));
              }}
            >
              Kembali ke Beranda
            </Button>
          </div>
        )}
      </div>

      </div>
      {isChatOpen && activeOrderId && (
        <ChatModal
          orderId={activeOrderId}
          onClose={() => setIsChatOpen(false)}
          receiverName={driverInfo?.name || 'Driver'}
        />
      )}
    </div>
  );
}
