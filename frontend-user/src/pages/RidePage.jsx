import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WiraMap from '../components/common/WiraMap';
import LocationAutocomplete from '../components/common/LocationAutocomplete';
import SavedAddressPicker from '../components/common/SavedAddressPicker';
import {
  ArrowRight,
  ChevronLeft,
  LocateFixed,
  Bike,
  Car,
  CarFront,
  Wallet,
  Banknote,
  Ticket,
  X,
} from 'lucide-react';
import { Button, Input, Money, Notice, IconTile, Badge, cx } from '../components/ui';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';

export default function RidePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [step, setStep] = useState('input'); // input, vehicle - post-booking UI lives on ActiveOrderPage
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('WiraPay'); // 'WiraPay' or 'Tunai'

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
          desc: t('ride.capacity', { count: v.capacity })
        })));
      }
    };
    fetchVehicles();
  }, []);

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
      toast.error(t('location.unsupported'));
      return;
    }

    const toastId = toast.loading(t('location.searching'));
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
        
        toast.success(t('location.found'), { id: toastId });
      },
      (error) => {
        console.error('GPS Error:', error);
        let errorMsg = t('location.failed');
        if (error.code === 1) errorMsg = t('location.denied');
        else if (error.code === 2) errorMsg = t('location.unavailable');
        else if (error.code === 3) errorMsg = t('location.timeout');
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

  // Fallback fleet, used only until the `vehicles` table loads. Names match
  // what the live app actually offers: WiraRide Motor and WiraRide Mobil.
  const defaultVehicles = [
    { id: 'motor', name: t('ride.vehicle_motor'), basePrice: 12000, price: 12000, icon: '🛵', desc: t('ride.capacity_motor') },
    { id: 'mobil', name: t('ride.vehicle_car'), basePrice: 25000, price: 25000, icon: '🚗', desc: t('ride.capacity_car') }
  ];

  const sourceVehicles = vehicles.length > 0 ? vehicles : defaultVehicles;

  const dynamicVehicles = sourceVehicles.map(v => {
    if (!routeInfo) return v;
    const distKm = routeInfo.distance / 1000;
    const extraKm = Math.max(0, distKm - 2);
    const perKmRate = v.perKmRate || (v.id === 'motor' ? 3000 : 5000);
    const dynamicPrice = (v.basePrice || v.price || 15000) + Math.ceil(extraKm * perKmRate);
    const estMins = Math.ceil(routeInfo.duration / 60);
    return { ...v, price: dynamicPrice, time: t('ride.eta_minutes', { minutes: estMins }) };
  });

  const handleLanjut = () => {
    if (!pickup || !dropoff) {
      toast.error(t('ride.missing_points'));
      return;
    }
    if (dynamicVehicles.length > 0) {
      setSelectedVehicle(dynamicVehicles[0]);
    }
    setStep('vehicle');
  };

  // Promo/kupon state for the vehicle-selection step. These were previously
  // referenced (handleCheckPromo, calculateFinalPrice) without ever being
  // declared, which crashed every render of the 'vehicle' step in
  // production (calculateFinalPrice() is called unconditionally on line
  // ~600's "Pesan Sekarang" button).
  const [promoCode, setPromoCode] = useState('');
  const [pickupNote, setPickupNote] = useState('');
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
      
      if (error || !data) throw new Error(t('promo.not_found'));
      if (data.status !== 'Active') throw new Error(t('promo.inactive'));
      if (isPromoExpired(data.validUntil)) throw new Error(t('promo.expired'));
      if (data.service_type && data.service_type !== 'ride') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  // A code chosen with "Use now" on the home promos (utils/pendingPromo).
  usePendingPromo('ride', promoCode, setPromoCode, handleCheckPromo);
  
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
      toast.error(t('ride.insufficient_balance'));
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

      const orderDetails = JSON.stringify({
        pickup: { name: withAddressNote(pickup, pickupNote), lat: pickupLat, lng: pickupLng },
        dropoff: { name: dropoff, lat: mapState.markers[1]?.lat, lng: mapState.markers[1]?.lng },
        route: mapState.route
      });

      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraRide ke ${dropoff}`,
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
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);

      // Dispatch is handled in ActiveOrderPage

      if (driverCount === 0) {
        toast.error(t('ride.no_driver_nearby'), { duration: 6000 });
      } else {
        toast.success(t('ride.searching_driver'));
      }
    } catch (err) {
      toast.error(t('ride.book_failed', { message: err.userMessage || err.message }), { id: 'order-create-error' });
    }
  };

  // ---- display-only helpers (no effect on pricing or booking) ----
  const finalPrice = step === 'vehicle' ? calculateFinalPrice() : 0;
  const insufficientBalance = step === 'vehicle' && paymentMethod === 'WiraPay' && balance < finalPrice;
  const distanceKm = routeInfo ? (routeInfo.distance / 1000).toFixed(1) : null;
  const etaLabel = routeInfo ? t('ride.eta_minutes', { minutes: Math.ceil(routeInfo.duration / 60) }) : null;
  const vehicleIcon = (id) => (id === 'motor' ? Bike : id === 'mobil' ? Car : CarFront);
  const helperBtn = 'inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-1.5 -mx-1.5 text-[12.5px] font-semibold text-brand-ink transition-colors hover:bg-brand-soft';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ground [&_.leaflet-container]:rounded-none">
      {/* Area Peta Interaktif */}
      <div className="absolute inset-0 z-0 bg-sunken">
        <WiraMap
          center={mapState.center}
          zoom={mapState.zoom}
          markers={mapState.markers}
          route={mapState.route}
          locateClassName="top-[40%] right-3"
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
      </div>

      {/* Top overlay: back button + (step 1) the pickup/destination search card */}
      <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[400] flex items-start gap-2 md:inset-x-auto md:left-1/2 md:top-6 md:w-[31rem] md:-translate-x-1/2">
        <button
          type="button"
          onClick={() => (step === 'vehicle' ? setStep('input') : navigate('/'))}
          title={t('common.back')}
          aria-label={t('common.back')}
          className="pointer-events-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink shadow-pop transition-colors hover:bg-sunken"
        >
          <ChevronLeft size={20} />
        </button>

        {step === 'input' && (
          <div className="pointer-events-auto min-w-0 flex-1 rounded-card border border-line bg-card p-3 shadow-pop">
            {/* Grid: marker rail on the left, inputs on the right. The rail line
                runs from the pickup dot to the destination square. */}
            <div className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-2.5">
              <span className="col-start-1 row-start-1 row-end-5 my-[22px] w-px justify-self-center bg-line-strong" aria-hidden="true" />
              <span className="relative z-[1] col-start-1 row-start-1 h-2.5 w-2.5 self-center justify-self-center rounded-full bg-brand ring-[3px] ring-brand-soft" aria-hidden="true" />
              <div className="col-start-2 row-start-1">
                <LocationAutocomplete
                  variant="bare"
                  label={t('activity.route_pickup')}
                  placeholder={t('ride.pickup_placeholder')}
                  value={pickup}
                  onChange={setPickup}
                  onSelect={(loc) => {
                    setMapState(prev => {
                      const newMarkers = [...prev.markers];
                      newMarkers[0] = { lat: loc.lat, lng: loc.lng };
                      return { ...prev, center: { lat: loc.lat, lng: loc.lng }, zoom: 19, markers: newMarkers };
                    });
                  }}
                />
              </div>
              <div className="col-start-2 row-start-2 flex min-h-9 flex-wrap items-center justify-between gap-x-3 py-0.5">
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
                <button type="button" onClick={() => handleLocateMe(0)} className={cx(helperBtn, 'ml-auto')}>
                  <LocateFixed size={14} aria-hidden="true" /> {t('common.use_current_location')}
                </button>
              </div>
              <div className="col-start-2 row-start-3 mb-2 border-t border-line" aria-hidden="true" />

              <span className="relative z-[1] col-start-1 row-start-4 h-2.5 w-2.5 self-center justify-self-center rounded-[3px] bg-danger ring-[3px] ring-danger-soft" aria-hidden="true" />
              <div className="col-start-2 row-start-4">
                <LocationAutocomplete
                  variant="bare"
                  label={t('activity.route_dropoff')}
                  placeholder={t('ride.dropoff_placeholder')}
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
              </div>
              <div className="col-start-2 row-start-5 flex min-h-9 flex-wrap items-center justify-between gap-x-3 pt-0.5">
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
                <button type="button" onClick={() => handleLocateMe(1)} className={cx(helperBtn, 'ml-auto')}>
                  <LocateFixed size={14} aria-hidden="true" /> {t('common.use_current_location')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booking panel: bottom sheet above the map (floating card on desktop) */}
      <section className={cx(
        'absolute inset-x-0 bottom-0 z-10 flex flex-col bg-ground shadow-sheet rounded-t-sheet',
        'md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:rounded-sheet',
        step === 'vehicle' ? 'max-h-[88%]' : 'max-h-[45%]',
      )}>
        <div className="flex shrink-0 justify-center pt-2.5 pb-1.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        {/* LANGKAH 1: PILIH TUJUAN CEPAT */}
        {step === 'input' && (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-1">
              {routeInfo ? (
                <div className="flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3">
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-muted">{t('ride.distance')}</span>
                  <span className="whitespace-nowrap font-mono text-[13px] text-ink-muted">{etaLabel}</span>
                  <span className="whitespace-nowrap font-mono text-[15px] font-medium text-ink">{distanceKm} km</span>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-muted">{t('common.map_pin_hint')}</p>
              )}
            </div>
            <div className="shrink-0 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-5">
              <Button
                block
                size="lg"
                onClick={handleLanjut}
                disabled={!pickup || !dropoff || isSearching || !routeInfo}
                isLoading={isSearching}
                rightIcon={<ArrowRight size={18} />}
              >
                {isSearching ? t('ride.calculating') : t('ride.continue')}
              </Button>
            </div>
          </>
        )}

        {/* LANGKAH 2: PILIH KENDARAAN & METODE BAYAR */}
        {step === 'vehicle' && (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-2">
              {/* Route summary: dot - line - square */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-[3px] pt-[5px]" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                  <span className="h-5 w-px bg-line-strong" />
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-danger" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    <span className="sr-only">{t('activity.route_pickup')}: </span>{pickup}
                  </p>
                  <p className="truncate text-[14px] font-semibold text-ink">
                    <span className="sr-only">{t('activity.route_dropoff')}: </span>{dropoff}
                  </p>
                </div>
                {distanceKm && (
                  <span className="shrink-0 whitespace-nowrap pt-0.5 font-mono text-xs text-ink-muted">{distanceKm} km</span>
                )}
              </div>

              <div className="h-px bg-line" aria-hidden="true" />

              <div className="flex flex-col gap-2.5">
                <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('ride.select_vehicle')}</h2>
                <div role="radiogroup" aria-label={t('ride.select_vehicle')} className="flex flex-col gap-2">
                  {dynamicVehicles.map((v) => {
                    const isSelected = selectedVehicle?.id === v.id;
                    const Icon = vehicleIcon(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedVehicle(v)}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-tile bg-card text-left transition-colors',
                          isSelected ? 'border-2 border-brand px-[13px] py-[11px]' : 'border border-line px-3.5 py-3 hover:border-line-strong',
                        )}
                      >
                        <span className={cx('inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', isSelected ? 'border-brand' : 'border-line-strong')} aria-hidden="true">
                          {isSelected && <span className="h-2 w-2 rounded-full bg-brand" />}
                        </span>
                        <IconTile tone="brand" size="sm"><Icon size={19} /></IconTile>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-bold text-ink">{v.name}</span>
                          <span className="text-[11.5px] leading-snug text-ink-muted">
                            {v.desc}{v.time ? <> · <span className="font-mono">{v.time}</span></> : null}
                          </span>
                        </span>
                        <Money value={v.price} className="shrink-0 text-[15px] font-medium text-ink" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <AddressNoteField
                id="ride-pickup-note"
                address={pickup}
                lat={mapState.markers[0]?.lat}
                lng={mapState.markers[0]?.lng}
                note={pickupNote}
                onNoteChange={setPickupNote}
              />

              {/* Kode Promo */}
              <div className="flex flex-col gap-1.5">
                {activePromo ? (
                  <div className="flex items-center gap-3 rounded-control border border-success-line bg-success-soft py-1.5 pl-3.5 pr-1.5">
                    <Ticket size={17} className="shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-success-ink">
                      {t('promo.applied', { code: activePromo.code })}
                    </span>
                    <button
                      type="button"
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[10px] px-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-card hover:text-danger-ink"
                      onClick={() => {
                        setActivePromo(null);
                        setPromoCode('');
                        setPromoError('');
                      }}
                    >
                      <X size={14} aria-hidden="true" /> {t('common.remove')}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      aria-label={t('promo.placeholder')}
                      placeholder={t('promo.placeholder')}
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      invalid={!!promoError}
                      className="min-w-0 flex-1 font-mono text-[14px] uppercase placeholder:font-sans placeholder:normal-case"
                    />
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      onClick={handleCheckPromo}
                      disabled={checkingPromo || !promoCode.trim()}
                      isLoading={checkingPromo}
                    >
                      {checkingPromo ? t('promo.checking') : t('promo.apply')}
                    </Button>
                  </div>
                )}
                {promoError && (
                  <p className="text-xs text-danger-ink">{promoError}</p>
                )}
              </div>

              {/* Metode Pembayaran */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{t('common.payment_method')}</span>
                <div role="radiogroup" aria-label={t('common.payment_method')} className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === 'WiraPay'}
                    onClick={() => setPaymentMethod('WiraPay')}
                    className={cx(
                      'flex min-h-[60px] min-w-0 items-center gap-2.5 rounded-control bg-card text-left transition-colors',
                      paymentMethod === 'WiraPay' ? 'border-2 border-brand px-[11px] py-[9px]' : 'border border-line px-3 py-2.5 hover:border-line-strong',
                    )}
                  >
                    <Wallet size={18} className="shrink-0 text-pay" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-semibold text-ink">WiraPay</span>
                      <Money value={balance} tone="muted" className="text-xs" />
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === 'Tunai'}
                    onClick={() => setPaymentMethod('Tunai')}
                    className={cx(
                      'flex min-h-[60px] min-w-0 items-center gap-2.5 rounded-control bg-card text-left transition-colors',
                      paymentMethod === 'Tunai' ? 'border-2 border-brand px-[11px] py-[9px]' : 'border border-line px-3 py-2.5 hover:border-line-strong',
                    )}
                  >
                    <Banknote size={18} className="shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0 text-[13px] font-semibold leading-snug text-ink">{t('common.pay_cash_cod')}</span>
                  </button>
                </div>
              </div>

              {insufficientBalance && (
                <Notice tone="danger">{t('ride.insufficient_balance')}</Notice>
              )}

              {activePromo && selectedVehicle && (
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="flex-1 text-ink-muted">{selectedVehicle.name}</span>
                  <Money value={selectedVehicle.price} tone="muted" className="line-through" />
                  <Badge tone="success">{activePromo.code}</Badge>
                </div>
              )}
            </div>

            <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-line px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-5">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setStep('input')}
              >
                {t('ride.change_route')}
              </Button>
              <Button
                size="lg"
                onClick={handleStartBooking}
              >
                {t('ride.book_now', { price: formatRupiah(calculateFinalPrice()) })}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
