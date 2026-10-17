import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Package, Briefcase, Luggage, Wallet, Banknote, Truck, Phone } from 'lucide-react';
import { Button, Card, Field, Input, Textarea, Money, Notice, IconTile, PageHeader, cx } from '../components/ui';
import AddressMapPicker from '../components/common/AddressMapPicker';
import { formatRupiah } from '../utils/formatRupiah';
import { fetchCoordinates, fetchRoute } from '../utils/osmHelpers';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import PromoField from '../components/common/PromoField';
import { WALLET_ENABLED } from '../config/wallet';
import { useAuth } from '../context/AuthContext';
import { uploadPrivateImage } from '../utils/imageUpload';
import JobPhotoPicker from '../components/common/JobPhotoPicker';
import PhoneInputWithSuggestions from '../components/common/PhoneInputWithSuggestions';

export default function SendPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  const [userProfile, setUserProfile] = useState(null);
  const [savedAddresses, setSavedAddresses] = useState([]);

  useEffect(() => {
    if (!user) return;
    const metaPhone = user.user_metadata?.phone || user.phone || '';
    const metaName = user.user_metadata?.name || user.user_metadata?.full_name || '';
    if (metaPhone || metaName) {
      setUserProfile({ phone: metaPhone, name: metaName });
    }
    supabase
      .from('users')
      .select('name, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserProfile((prev) => ({
            phone: data.phone || prev?.phone || '',
            name: data.name || prev?.name || '',
          }));
        }
      });

    supabase
      .from('saved_addresses')
      .select('id, label, phone')
      .eq('user_id', user.id)
      .not('phone', 'is', null)
      .then(({ data }) => {
        if (data) setSavedAddresses(data);
      });
  }, [user]);

  const [selectedPackage, setSelectedPackage] = useState('kecil');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx's
  // handleCheckPromo/activePromo/calculateFinalPrice.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Form State
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [senderNote, setSenderNote] = useState('');
  const [senderCoords, setSenderCoords] = useState(null);

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverNote, setReceiverNote] = useState('');
  const [receiverCoords, setReceiverCoords] = useState(null);
  const [itemNote, setItemNote] = useState('');
  // "Barang besar (mobil)" (migrations/0128): photos, no price up front.
  const [bigDesc, setBigDesc] = useState('');
  const [bigPhotos, setBigPhotos] = useState([]); // File[]
  const [bigHelper, setBigHelper] = useState(false);

  // `name` stays Indonesian on purpose: it is written into the order's
  // `details`, which the courier reads in the partner app. Only the labels
  // rendered on this screen are translated.
  // Fallback until pricing_rules (service_type 'send', edited in Admin ->
  // Harga) loads. The server prices the order from the same rows:
  // base_price + ceil(km x per_km_rate) (migrations/0059).
  const FALLBACK_PACKAGES = [
    { id: 'dokumen', name: 'Dokumen', base: 8000, perKm: 0 },
    { id: 'kecil', name: 'Paket Kecil', base: 12000, perKm: 0 },
    { id: 'sedang', name: 'Paket Sedang', base: 18000, perKm: 0 },
    { id: 'besar', name: 'Paket Besar', base: 30000, perKm: 0 },
  ];
  const [rules, setRules] = useState(null);
  const [hasBigItem, setHasBigItem] = useState(false);
  const [routeMeters, setRouteMeters] = useState(null);

  useEffect(() => {
    supabase.from('pricing_rules').select('*')
      .eq('service_type', 'send').eq('is_active', true).order('base_price')
      .then(({ data }) => {
        // Titip beli and Barang besar are is_custom rows, not packages.
        const plain = (data || []).filter((r) => !r.is_custom);
        if (plain.length) {
          setRules(plain.map((r) => ({ id: r.code, name: r.name || r.code, base: Number(r.base_price) || 0, perKm: Number(r.per_km_rate) || 0 })));
        }
        setHasBigItem((data || []).some((r) => r.code === 'BESAR'));
      });
  }, []);

  // Road distance once both points are known (same OSRM route as WiraRide).
  useEffect(() => {
    if (!senderCoords || !receiverCoords) { setRouteMeters(null); return; }
    let cancelled = false;
    fetchRoute(senderCoords, receiverCoords).then((r) => { if (!cancelled) setRouteMeters(r?.distance ?? null); });
    return () => { cancelled = true; };
  }, [senderCoords, receiverCoords]);

  // Distance prices round up to Rp500, as the server does (migrations/0113).
  const priceOf = (p) => (p.perKm > 0 && routeMeters ? Math.ceil((p.base + Math.ceil((routeMeters / 1000) * p.perKm)) / 500) * 500 : p.base);
  const packages = (rules || FALLBACK_PACKAGES).map((p) => ({ ...p, price: priceOf(p) }));
  const packageLabel = (p, suffix = '') => {
    const key = `send.packages.${p.id}${suffix}`;
    const txt = t(key);
    return txt === key ? (suffix ? '' : p.name) : txt;
  };

  const isBig = selectedPackage === 'BESAR';
  const currentPkg = packages.find((p) => p.id === selectedPackage) || packages[0];

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
      if (data.service_type && data.service_type !== 'send') throw new Error(t('promo.wrong_service'));

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
  usePendingPromo('send', promoCode, setPromoCode, handleCheckPromo);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateFinalPrice = () => {
    if (isBig) return 0;
    const basePrice = currentPkg.price;
    if (!activePromo) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!senderName || !senderPhone || !senderAddress || !receiverName || !receiverPhone || !receiverAddress) {
      toast.error(t('send.incomplete'));
      return;
    }
    if (isBig && bigDesc.trim().length < 10) {
      toast.error(t('send.big_desc_required'));
      return;
    }
    if (isBig && bigPhotos.length === 0) {
      toast.error(t('send.big_photo_required'));
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(t('send.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const resi = 'WRS-' + Math.floor(100000 + Math.random() * 900000);

      // Best-effort geocode of the pickup address so nearby couriers can be
      // notified (mirrors RestaurantPage.jsx geocoding a merchant's address)
      // - SendPage previously had no coordinates at all, only free-text
      // addresses. A failed/empty geocode just means no nearby-courier
      // notification fires below; it must never block the booking itself.
      // Points picked on the map (search, GPS or dragged pin) win; the text
      // geocode is only the fallback for an address typed without a pin.
      let pickupLat = senderCoords?.lat ?? null;
      let pickupLng = senderCoords?.lng ?? null;
      let dropoffLat = receiverCoords?.lat ?? null;
      let dropoffLng = receiverCoords?.lng ?? null;
      try {
        const [pickupCoords, dropoffCoords] = await Promise.all([
          senderCoords ? null : fetchCoordinates(senderAddress),
          receiverCoords ? null : fetchCoordinates(receiverAddress),
        ]);
        if (pickupCoords) {
          pickupLat = pickupCoords.lat;
          pickupLng = pickupCoords.lng;
        }
        if (dropoffCoords) {
          dropoffLat = dropoffCoords.lat;
          dropoffLng = dropoffCoords.lng;
        }
      } catch (geoErr) {
        console.error('Failed to geocode WiraSend address:', geoErr);
      }

      // Nearest-driver lookup, reused as the notification fan-out target the
      // same way RidePage.jsx does. NOTE on eligibility: not every driver
      // can take a Send job (migrations/0033 - requires 'send' in
      // job_type_preferences, and for a 'mobil' driver additionally
      // package_size IN ('sedang','besar')). get_nearest_drivers only
      // filters by vehicle type/online status, not job-type preferences, so
      // this can notify some drivers who aren't actually eligible to claim
      // this particular Send job. A proper client-side eligibility filter
      // was considered (querying users.job_type_preferences for the nearby
      // ids) but public.users' RLS (migrations/0025/0026) only lets a
      // customer read a driver's row once that driver is actually assigned
      // to one of their orders - it can't be read for an unmatched nearby
      // candidate without a new SECURITY DEFINER RPC, which is out of scope
      // tonight. Per the task's own guidance this is low-severity noise (an
      // ineligible driver just can't claim it), so option (a) - notify
      // plain nearest drivers - is used here, same as Ride.
      let nearbyDrivers = [];
      if (pickupLat != null && pickupLng != null) {
        const { data: nearby } = await supabase.rpc('get_nearest_drivers', {
          user_lat: pickupLat,
          user_lng: pickupLng,
          target_vehicle_type: null,
          only_online: true,
          max_results: 5,
        });
        nearbyDrivers = nearby || [];
      }

      let bigPhotoPaths = [];
      if (isBig) {
        try {
          bigPhotoPaths = await Promise.all(bigPhotos.map((f) => uploadPrivateImage(supabase, 'order-photos', user.id, f)));
        } catch (upErr) {
          console.error('Big item photo upload failed:', upErr);
          toast.error(t('service.custom_photo_failed'));
          return;
        }
      }

      const order = await addOrder(isBig ? {
        paymentDescription: `WiraSend Barang besar ke ${receiverName}`,
        service: 'WiraSend',
        serviceType: 'send',
        title: `Barang besar ke ${receiverName}`,
        details: `No. Resi: ${resi} • Barang besar (mobil)${bigHelper ? ' • Perlu bantu angkat' : ''} (${withAddressNote(senderAddress, senderNote)} ➔ ${withAddressNote(receiverAddress, receiverNote)})`,
        price: 0,
        status: 'pending',
        paymentMethod: 'Tunai',
        packageSize: 'mobil',
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        rateCode: 'BESAR',
        distanceMeters: routeMeters ?? null,
        promoCode: null,
        metadata: { job: { description: bigDesc.trim(), photos: bigPhotoPaths, helper: bigHelper } },
      } : {
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraSend Paket ke ${receiverName}`,
        service: 'WiraSend',
        serviceType: 'send',
        title: `Kirim Paket ke ${receiverName}`,
        details: `No. Resi: ${resi} • ${currentPkg.name} (${withAddressNote(senderAddress, senderNote)} ➔ ${withAddressNote(receiverAddress, receiverNote)})`,
        price: finalPrice,
        status: 'pending',
        paymentMethod: paymentMethod,
        packageSize: selectedPackage,
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        // selectedPackage already holds the exact tier id ('dokumen' |
        // 'kecil' | 'sedang' | 'besar'), matching pricing_rules.code for
        // service_type='send' (migrations/0057's seed).
        rateCode: currentPkg.id,
        distanceMeters: routeMeters ?? null,
        promoCode: activePromo?.code || null,
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      if (order?.id) navigate(`/active-order/${order.id}`);

      // Best-effort nearby-courier push, fired only after the order exists,
      // never blocking or surfacing an error to the customer's booking flow.

      handleRemovePromo(); // don't let a used promo silently discount the next Send order
      toast.success(t('send.searching_courier'));
    } catch (err) {
      toast.error(t('send.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

  // ---- display-only helpers (no effect on pricing or booking) ----
  const finalPrice = calculateFinalPrice();
  const insufficientBalance = paymentMethod === 'WiraPay' && balance < finalPrice;
  const PACKAGE_ICONS = { dokumen: FileText, kecil: Package, sedang: Briefcase, besar: Luggage };
  const optionCls = (active) => cx(
    'flex min-w-0 items-center gap-2.5 rounded-control bg-card text-left transition-colors',
    active ? 'border-2 border-brand px-[11px] py-[9px]' : 'border border-line px-3 py-2.5 hover:border-line-strong',
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        title={t('send.title')}
        subtitle={t('send.subtitle')}
        className="mb-0"
      />

      <form onSubmit={handleOrderSubmit} className="flex flex-col gap-4">
          {/* Detail Pengirim */}
          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-[3px] ring-brand-soft" aria-hidden="true" />
              {t('send.sender_section')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('send.sender_name')} htmlFor="send-sender-name" required>
                <Input
                  id="send-sender-name"
                  type="text"
                  autoComplete="name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('send.sender_phone')} htmlFor="send-sender-phone" required>
                <PhoneInputWithSuggestions
                  id="send-sender-phone"
                  value={senderPhone}
                  onChange={setSenderPhone}
                  onSelectSuggestion={({ name }) => {
                    if (!senderName && name) setSenderName(name);
                  }}
                  userProfile={userProfile}
                  savedAddresses={savedAddresses}
                  placeholder={t('wallet.recipient_placeholder')}
                  required
                />
              </Field>
            </div>
            <AddressMapPicker
              id="send-sender-address"
              label={t('addresses.address_field')}
              placeholder={t('send.sender_address')}
              address={senderAddress}
              onAddressChange={setSenderAddress}
              coords={senderCoords}
              onCoordsChange={setSenderCoords}
              onNoteChange={setSenderNote}
              onPhoneChange={(p) => { if (p) setSenderPhone(p); }}
              markerType="pickup"
              pinLabel={t('send.sender_section')}
            />
            <AddressNoteField id="send-sender-note" address={senderAddress} lat={senderCoords?.lat} lng={senderCoords?.lng} note={senderNote} onNoteChange={setSenderNote} defaultPhone={senderPhone} />
          </Card>

          {/* Detail Penerima */}
          <Card className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-danger ring-[3px] ring-danger-soft" aria-hidden="true" />
              {t('send.receiver_section')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('send.receiver_name')} htmlFor="send-receiver-name" required>
                <Input
                  id="send-receiver-name"
                  type="text"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('send.receiver_phone')} htmlFor="send-receiver-phone" required>
                <PhoneInputWithSuggestions
                  id="send-receiver-phone"
                  value={receiverPhone}
                  onChange={setReceiverPhone}
                  onSelectSuggestion={({ name }) => {
                    if (!receiverName && name) setReceiverName(name);
                  }}
                  userProfile={userProfile}
                  savedAddresses={savedAddresses}
                  placeholder={t('wallet.recipient_placeholder')}
                  required
                />
              </Field>
            </div>
            <AddressMapPicker
              id="send-receiver-address"
              label={t('addresses.address_field')}
              placeholder={t('send.receiver_address')}
              address={receiverAddress}
              onAddressChange={setReceiverAddress}
              coords={receiverCoords}
              onCoordsChange={setReceiverCoords}
              onNoteChange={setReceiverNote}
              onPhoneChange={(p) => { if (p) setReceiverPhone(p); }}
              markerType="dropoff"
              pinLabel={t('send.receiver_section')}
            />
            <AddressNoteField id="send-receiver-note" address={receiverAddress} lat={receiverCoords?.lat} lng={receiverCoords?.lng} note={receiverNote} onNoteChange={setReceiverNote} defaultPhone={receiverPhone} />
            <Field label={t('wallet.transfer_note_label')} htmlFor="send-item-note">
              <Input
                id="send-item-note"
                type="text"
                placeholder={t('send.item_note')}
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
              />
            </Field>
          </Card>

          {/* Pilih Ukuran Paket */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('send.package_section')}</h2>
            <div role="radiogroup" aria-label={t('send.package_section')} className="grid grid-cols-2 gap-2.5">
              {packages.map((p) => {
                const isSelected = selectedPackage === p.id;
                const Icon = PACKAGE_ICONS[p.id] || Package;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedPackage(p.id)}
                    className={cx(
                      'flex h-full min-w-0 flex-col items-start gap-2.5 rounded-tile bg-card text-left transition-colors',
                      isSelected ? 'border-2 border-brand p-[13px]' : 'border border-line p-3.5 hover:border-line-strong',
                    )}
                  >
                    <IconTile tone="brand" size="sm"><Icon size={18} /></IconTile>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[14px] font-bold leading-snug text-ink">{packageLabel(p)}</span>
                      <span className="text-[11.5px] leading-snug text-ink-muted">{packageLabel(p, '_desc')}</span>
                    </span>
                    <span className="mt-auto flex flex-col gap-0.5">
                      <Money value={p.price} className="text-[14px] font-medium text-ink" />
                      {p.perKm > 0 && (
                        <span className="text-[11px] text-ink-muted">
                          {routeMeters ? t('send.distance_km', { km: (routeMeters / 1000).toFixed(1) }) : t('send.per_km', { price: formatRupiah(p.perKm) })}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {hasBigItem && (
              <button
                type="button"
                role="radio"
                aria-checked={isBig}
                onClick={() => setSelectedPackage('BESAR')}
                className={cx(
                  'flex min-w-0 items-start gap-3 rounded-tile text-left transition-colors',
                  isBig ? 'border-2 border-brand bg-brand-soft/50 p-[13px]' : 'border border-pay-line bg-pay-soft p-3.5 hover:border-line-strong',
                )}
              >
                <IconTile tone="brand" size="sm"><Truck size={18} /></IconTile>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold leading-snug text-ink">{t('send.big_title')}</span>
                  <span className="text-[12px] leading-snug text-ink-muted">{t('send.big_desc')}</span>
                  <span className="text-[12px] font-semibold text-ink">{t('send.big_price')}</span>
                </span>
              </button>
            )}
            {isBig && (
              <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5">
                <Field label={t('send.big_desc_label')} htmlFor="send-big-desc" required hint={t('send.big_desc_hint')}>
                  <Textarea
                    id="send-big-desc"
                    rows={3}
                    maxLength={500}
                    value={bigDesc}
                    onChange={(e) => setBigDesc(e.target.value)}
                    placeholder={t('send.big_desc_placeholder')}
                    required
                  />
                </Field>
                <JobPhotoPicker files={bigPhotos} onChange={setBigPhotos} />
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-semibold text-ink">{t('send.big_helper')}</span>
                  <div role="radiogroup" aria-label={t('send.big_helper')} className="grid grid-cols-2 gap-2">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        role="radio"
                        aria-checked={bigHelper === v}
                        onClick={() => setBigHelper(v)}
                        className={cx(optionCls(bigHelper === v), 'justify-center text-[13px] font-semibold text-ink')}
                      >
                        {v ? t('send.big_helper_yes') : t('send.big_helper_no')}
                      </button>
                    ))}
                  </div>
                </div>
                <Notice tone="warning">{t('send.big_note')}</Notice>
                <Link to="/support" className="text-[13px] font-semibold text-brand-ink hover:underline">{t('send.big_truck_cta')}</Link>
              </div>
            )}
          </section>

          {!isBig && <PromoField
            id="send-promo"
            activePromo={activePromo}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            onApply={handleCheckPromo}
            onRemove={handleRemovePromo}
            checking={checkingPromo}
            error={promoError}
          />}

          {/* Metode Pembayaran */}
          <section className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('common.payment_method')}</h2>
              <p className="text-[13px] leading-relaxed text-ink-muted">{t('send.payment_hint')}</p>
            </div>
            <div role="radiogroup" aria-label={t('common.payment_method')} className={cx('grid gap-2', WALLET_ENABLED ? 'grid-cols-2' : 'grid-cols-1')}>
              {WALLET_ENABLED && !isBig && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={paymentMethod === 'WiraPay'}
                  onClick={() => setPaymentMethod('WiraPay')}
                  className={cx(optionCls(paymentMethod === 'WiraPay'), 'min-h-[60px]')}
                >
                  <Wallet size={18} className="shrink-0 text-pay" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold text-ink">WiraPay</span>
                    <Money value={balance} tone="muted" className="text-xs" />
                  </span>
                </button>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                className={cx(optionCls(paymentMethod === 'Tunai'), 'min-h-[60px]')}
              >
                <Banknote size={18} className="shrink-0 text-success" aria-hidden="true" />
                <span className="min-w-0 text-[13px] font-semibold leading-snug text-ink">{t('common.pay_cash_cod')}</span>
              </button>
            </div>
          </section>

          {/* Booking panel: pinned above the bottom nav so the CTA is always reachable */}
          <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">

            {insufficientBalance && (
              <Notice tone="danger">{t('send.insufficient_balance')}</Notice>
            )}

            {activePromo && (
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-muted">{t('send.package_price')}</span>
                <Money value={currentPkg.price} tone="muted" className="line-through" />
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              block
              isLoading={loading}
            >
              {loading ? t('send.booking') : isBig ? t('send.big_submit') : t('send.submit', { price: formatRupiah(calculateFinalPrice()) })}
            </Button>
          </div>
        </form>
    </div>
  );
}
