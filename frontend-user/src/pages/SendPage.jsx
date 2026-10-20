import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Package,
  Briefcase,
  Luggage,
  Wallet,
  Banknote,
  Truck,
  Bike,
  ArrowRight,
  Check,
  ChevronLeft,
  MapPin,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Money,
  Notice,
  IconTile,
  PageHeader,
  Segmented,
  Badge,
  cx,
} from '../components/ui';
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

  // Wizard Step: 1 = Rute & Kontak, 2 = Paket & Armada, 3 = Konfirmasi & Pembayaran
  const [step, setStep] = useState(1);

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

  // Pre-fill sender with logged-in user profile for seamless usability
  useEffect(() => {
    if (userProfile) {
      if (!senderName && userProfile.name) setSenderName(userProfile.name);
      if (!senderPhone && userProfile.phone) setSenderPhone(userProfile.phone);
    }
  }, [userProfile]);

  const [selectedPackage, setSelectedPackage] = useState('kecil');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Form State - Pengirim
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [senderNote, setSenderNote] = useState('');
  const [senderCoords, setSenderCoords] = useState(null);

  // Form State - Penerima
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverNote, setReceiverNote] = useState('');
  const [receiverCoords, setReceiverCoords] = useState(null);
  const [itemNote, setItemNote] = useState('');

  // "Barang besar (mobil)" (migrations/0128)
  const [bigDesc, setBigDesc] = useState('');
  const [bigPhotos, setBigPhotos] = useState([]); // File[]
  const [bigHelper, setBigHelper] = useState(false);

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
    supabase
      .from('pricing_rules')
      .select('*')
      .eq('service_type', 'send')
      .eq('is_active', true)
      .order('base_price')
      .then(({ data }) => {
        const plain = (data || []).filter((r) => !r.is_custom);
        if (plain.length) {
          setRules(plain.map((r) => ({ id: r.code, name: r.name || r.code, base: Number(r.base_price) || 0, perKm: Number(r.per_km_rate) || 0 })));
        }
        setHasBigItem((data || []).some((r) => r.code === 'BESAR'));
      });
  }, []);

  // Road distance once both points are known
  useEffect(() => {
    if (!senderCoords || !receiverCoords) {
      setRouteMeters(null);
      return;
    }
    let cancelled = false;
    fetchRoute(senderCoords, receiverCoords).then((r) => {
      if (!cancelled) setRouteMeters(r?.distance ?? null);
    });
    return () => {
      cancelled = true;
    };
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

  // Step 1 Validation & Proceed
  const handleProceedStep1 = (e) => {
    e.preventDefault();
    if (!senderName.trim() || !senderPhone.trim() || !senderAddress.trim() ||
        !receiverName.trim() || !receiverPhone.trim() || !receiverAddress.trim()) {
      toast.error(t('send.incomplete'));
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2 Validation & Proceed
  const handleProceedStep2 = () => {
    if (isBig && bigDesc.trim().length < 10) {
      toast.error(t('send.big_desc_required'));
      return;
    }
    if (isBig && bigPhotos.length === 0) {
      toast.error(t('send.big_photo_required'));
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Order Submission (Step 3)
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error(t('common.login_required'));
      navigate('/login');
      return;
    }
    if (!senderName || !senderPhone || !senderAddress || !receiverName || !receiverPhone || !receiverAddress) {
      toast.error(t('send.incomplete'));
      setStep(1);
      return;
    }
    if (isBig && bigDesc.trim().length < 10) {
      toast.error(t('send.big_desc_required'));
      setStep(2);
      return;
    }
    if (isBig && bigPhotos.length === 0) {
      toast.error(t('send.big_photo_required'));
      setStep(2);
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
        rateCode: currentPkg.id,
        distanceMeters: routeMeters ?? null,
        promoCode: activePromo?.code || null,
      });

      if (paymentMethod === 'WiraPay') refreshWallet();

      if (order?.id) navigate(`/active-order/${order.id}`);

      handleRemovePromo();
      toast.success(t('send.searching_courier'));
    } catch (err) {
      toast.error(t('send.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

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
        back={step === 1 ? '/' : true}
        onBack={step > 1 ? () => setStep(step - 1) : undefined}
        backLabel={step === 1 ? t('common.back') : (step === 2 ? t('send.change_route') : t('send.change_package'))}
        title={t('send.title')}
        subtitle={t('send.subtitle')}
        className="mb-0"
      />

      {/* Step Progress Pill */}
      <div className="flex items-center justify-between rounded-card border border-line bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-sm">
            {step}
          </span>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold uppercase tracking-wider text-brand-ink">
              {step === 1 && (t('send.step_1_of_3') || 'Langkah 1: Rute & Kontak')}
              {step === 2 && (t('send.step_2_of_3') || 'Langkah 2: Pilih Paket & Armada')}
              {step === 3 && (t('send.step_3_of_3') || 'Langkah 3: Konfirmasi & Bayar')}
            </span>
            <span className="text-[11px] text-ink-muted">
              {step === 1 && (t('send.incomplete') ? 'Isi detail penjemputan dan pengantaran' : 'Langkah 1 dari 3')}
              {step === 2 && (t('send.package_section') || 'Pilih ukuran atau jenis barang')}
              {step === 3 && (t('common.payment_method') || 'Periksa rincian dan pilih pembayaran')}
            </span>
          </div>
        </div>

        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-control border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted hover:bg-sunken hover:text-ink transition-colors"
          >
            ← {t('common.back')}
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* LANGKAH 1: RUTE & KONTAK (PENGIRIM & PENERIMA)            */}
      {/* ======================================================== */}
      {step === 1 && (
        <form onSubmit={handleProceedStep1} className="flex flex-col gap-4 animate-fadeIn">
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
                  placeholder="Nama pengirim paket"
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
              collapsible={true}
              defaultExpanded={false}
            />
            <AddressNoteField
              id="send-sender-note"
              address={senderAddress}
              lat={senderCoords?.lat}
              lng={senderCoords?.lng}
              note={senderNote}
              onNoteChange={setSenderNote}
              defaultPhone={senderPhone}
            />
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
                  placeholder="Nama penerima paket"
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
              collapsible={true}
              defaultExpanded={false}
            />
            <AddressNoteField
              id="send-receiver-note"
              address={receiverAddress}
              lat={receiverCoords?.lat}
              lng={receiverCoords?.lng}
              note={receiverNote}
              onNoteChange={setReceiverNote}
              defaultPhone={receiverPhone}
            />
            <Field label={t('send.item_note_label') || t('wallet.transfer_note_label')} htmlFor="send-item-note">
              <Input
                id="send-item-note"
                type="text"
                placeholder={t('send.item_note')}
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
              />
            </Field>
          </Card>

          {/* Quick Route Preview Pill */}
          {senderAddress && receiverAddress && (
            <div className="flex flex-col gap-1.5 rounded-card border border-brand-line bg-brand-soft/40 p-3.5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-brand-ink">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-brand" />
                  {t('send.route_summary') || 'Rute Pengiriman'}
                </span>
                {routeMeters && (
                  <span className="font-mono font-bold text-ink">
                    {(routeMeters / 1000).toFixed(1)} km
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <span className="truncate max-w-[44%] font-semibold text-ink">{senderAddress.split(',')[0]}</span>
                <span className="text-ink-muted">➔</span>
                <span className="truncate max-w-[44%] font-semibold text-ink">{receiverAddress.split(',')[0]}</span>
              </div>
            </div>
          )}

          {/* Proceed Button */}
          <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 shadow-sm">
            <Button
              type="submit"
              size="lg"
              block
              className="flex items-center justify-between font-bold"
            >
              <span>{t('send.proceed_to_package') || 'Lanjut: Pilih Paket'}</span>
              <span className="text-lg">→</span>
            </Button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* LANGKAH 2: PILIH PAKET & ARMADA                           */}
      {/* ======================================================== */}
      {step === 2 && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Ringkasan Rute dari Step 1 */}
          <div className="flex items-center justify-between rounded-card border border-brand-line bg-brand-soft/30 p-3.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-ink">
                {t('send.route_summary') || 'Rute Pengiriman'}
              </span>
              <div className="truncate text-[13.5px] font-bold text-ink">
                {senderAddress.split(',')[0]} ➔ {receiverAddress.split(',')[0]}
              </div>
              {routeMeters && (
                <span className="font-mono text-[12px] font-semibold text-ink-muted">
                  {t('send.est_distance') || 'Jarak'}: {(routeMeters / 1000).toFixed(1)} km
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="shrink-0 rounded-control bg-card px-3 py-1.5 text-xs font-bold text-brand-ink border border-brand/30 hover:bg-sunken transition-colors"
            >
              {t('send.change_route') || 'Ubah Rute'}
            </button>
          </div>

          {/* Pilih Kendaraan (Segmented) */}
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">
              {t('send.vehicle_type') || 'Pilih Armada Pengiriman'}
            </h2>
            <Segmented
              ariaLabel={t('send.vehicle_type') || 'Pilih Armada'}
              value={isBig ? 'mobil' : 'motor'}
              onChange={(v) => {
                if (v === 'mobil') {
                  setSelectedPackage('BESAR');
                } else {
                  if (selectedPackage === 'BESAR') setSelectedPackage('kecil');
                }
              }}
              options={[
                { value: 'motor', label: t('send.vehicle_motor') || 'Motor (Paket Reguler)' },
                { value: 'mobil', label: t('send.vehicle_car') || 'Mobil (Barang Besar)' },
              ]}
              className="w-full"
            />
          </section>

          {/* OPSI MOTOR: 4 UKURAN PAKET */}
          {!isBig && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-[14px] font-bold text-ink">{t('send.package_section')}</h3>
                <p className="text-[12px] text-ink-muted">{t('send.package_subtitle')}</p>
              </div>
              <div role="radiogroup" aria-label={t('send.package_section')} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                        'flex min-h-[92px] min-w-0 items-start gap-3 rounded-card text-left transition-all',
                        isSelected
                          ? 'border-2 border-brand bg-brand-soft/25 p-[13px] shadow-sm'
                          : 'border border-line bg-card p-3.5 hover:border-line-strong',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          'mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                          isSelected ? 'border-brand' : 'border-line-strong',
                        )}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </span>

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Icon size={16} className={isSelected ? 'text-brand-ink' : 'text-ink-muted'} />
                          <span className="text-[14px] font-bold leading-snug text-ink">{packageLabel(p)}</span>
                        </div>
                        <span className="text-[12px] leading-snug text-ink-muted">{packageLabel(p, '_desc')}</span>
                        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                          <Money value={p.price} className="font-mono text-[14px] font-bold text-ink" />
                          {p.perKm > 0 && (
                            <span className="text-[11px] text-ink-muted">
                              {routeMeters ? `(${(routeMeters / 1000).toFixed(1)} km)` : t('send.per_km', { price: formatRupiah(p.perKm) })}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* OPSI MOBIL: BARANG BESAR (PINDAHAN / FURNITUR) */}
          {isBig && (
            <Card className="flex flex-col gap-4 border-2 border-brand bg-card">
              <div className="flex items-start gap-3">
                <IconTile tone="brand" size="md"><Truck size={22} /></IconTile>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-bold text-ink">{t('send.big_title')}</h3>
                    <Badge tone="brand">{t('send.fleet_car')}</Badge>
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{t('send.big_desc')}</p>
                </div>
              </div>

              <div className="rounded-control bg-brand-soft/50 p-3 text-[12.5px] leading-relaxed text-brand-ink">
                <strong>{t('send.big_price')}</strong>: {t('send.big_item_price_note') || 'Tarif disepakati dengan driver melalui penawaran di aplikasi setelah driver melihat foto barang.'}
              </div>

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

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">
                  {t('send.item_photo')} <span className="text-danger">*</span>
                </label>
                <p className="text-[12px] text-ink-muted">{t('send.item_photo_hint')}</p>
                <JobPhotoPicker files={bigPhotos} onChange={setBigPhotos} />
              </div>

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
                      className={cx(optionCls(bigHelper === v), 'justify-center text-[13px] font-semibold text-ink min-h-[44px]')}
                    >
                      {v ? t('send.big_helper_yes') : t('send.big_helper_no')}
                    </button>
                  ))}
                </div>
              </div>

              <Notice tone="neutral">{t('send.big_note')}</Notice>
              <Link to="/support" className="text-[13px] font-semibold text-brand-ink hover:underline">
                {t('send.big_truck_cta')}
              </Link>
            </Card>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex w-full items-center gap-2 rounded-card border border-line bg-card p-4 shadow-sm">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="shrink-0"
            >
              ← {t('common.back')}
            </Button>
            <Button
              type="button"
              size="lg"
              block
              onClick={handleProceedStep2}
              className="flex-1 flex items-center justify-between font-bold"
            >
              <span>{t('send.proceed_to_payment') || 'Lanjut: Pembayaran'}</span>
              <span className="text-lg">→</span>
            </Button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* LANGKAH 3: KONFIRMASI & PEMBAYARAN                       */}
      {/* ======================================================== */}
      {step === 3 && (
        <form onSubmit={handleOrderSubmit} className="flex flex-col gap-4 animate-fadeIn">
          {/* Ringkasan Lengkap Pesanan */}
          <Card className="flex flex-col gap-4">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">
              {t('send.package_summary') || 'Ringkasan Pesanan'}
            </h2>

            {/* Rute Info Box */}
            <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  {t('send.route_summary') || 'Rute'}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-bold text-brand-ink hover:underline"
                >
                  {t('send.change_route') || 'Ubah'}
                </button>
              </div>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-ink">{senderName} ({senderPhone})</span>
                    <span className="text-ink-muted">{senderAddress} {senderNote ? `(${senderNote})` : ''}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-[2px] bg-danger" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-ink">{receiverName} ({receiverPhone})</span>
                    <span className="text-ink-muted">{receiverAddress} {receiverNote ? `(${receiverNote})` : ''}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Paket Info Box */}
            <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  {t('send.package_section') || 'Paket'}
                </span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-bold text-brand-ink hover:underline"
                >
                  {t('send.change_package') || 'Ubah'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-ink">
                    {isBig ? t('send.big_title') : packageLabel(currentPkg)}
                  </span>
                  <span className="text-[12px] text-ink-muted">
                    {isBig ? `${bigPhotos.length} foto barang` : packageLabel(currentPkg, '_desc')}
                  </span>
                  {itemNote && (
                    <span className="text-[12px] italic text-ink-muted">
                      Catatan: &ldquo;{itemNote}&rdquo;
                    </span>
                  )}
                </div>
                {routeMeters && (
                  <span className="font-mono text-xs font-semibold text-ink-muted">
                    {(routeMeters / 1000).toFixed(1)} km
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Kupon Promo (Hanya untuk pengiriman motor) */}
          {!isBig && (
            <PromoField
              id="send-promo"
              activePromo={activePromo}
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              onApply={handleCheckPromo}
              onRemove={handleRemovePromo}
              checking={checkingPromo}
              error={promoError}
            />
          )}

          {/* Metode Pembayaran */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('common.payment_method')}</h2>
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                {isBig
                  ? 'Pembayaran tunai langsung ke driver setelah kesepakatan harga di aplikasi.'
                  : t('send.payment_hint')}
              </p>
            </div>
            <div role="radiogroup" aria-label={t('common.payment_method')} className={cx('grid gap-2', WALLET_ENABLED && !isBig ? 'grid-cols-2' : 'grid-cols-1')}>
              {WALLET_ENABLED && !isBig && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={paymentMethod === 'WiraPay'}
                  onClick={() => setPaymentMethod('WiraPay')}
                  className={cx(optionCls(paymentMethod === 'WiraPay'), 'min-h-[56px]')}
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
                className={cx(optionCls(paymentMethod === 'Tunai'), 'min-h-[56px]')}
              >
                <Banknote size={18} className="shrink-0 text-success" aria-hidden="true" />
                <span className="min-w-0 text-[13px] font-semibold leading-snug text-ink">{t('common.pay_cash_cod')}</span>
              </button>
            </div>
          </Card>

          {/* Rincian Harga & Tombol Kirim */}
          <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 shadow-sm">
            {insufficientBalance && (
              <Notice tone="danger">{t('send.insufficient_balance')}</Notice>
            )}

            {!isBig && (
              <div className="flex flex-col gap-1.5 border-b border-line pb-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-muted">{t('send.delivery_cost') || t('send.package_price')}</span>
                  <Money value={currentPkg.price} className="font-mono text-ink" />
                </div>

                {activePromo && (
                  <div className="flex items-center justify-between text-[13px] text-success">
                    <span>{t('send.promo_discount') || 'Diskon Promo'}</span>
                    <span>- <Money value={currentPkg.price - finalPrice} /></span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-[15px] font-bold">
                  <span className="text-ink">{t('send.total_payment') || 'Total Bayar'}</span>
                  <Money value={finalPrice} className="font-mono text-[17px] text-brand-ink" />
                </div>
              </div>
            )}

            {isBig && (
              <div className="flex flex-col gap-1 border-b border-line pb-3 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{t('send.big_price')}</span>
                <span>{t('send.big_note')}</span>
              </div>
            )}

            <div className="flex w-full items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => {
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="shrink-0"
              >
                ← {t('common.back')}
              </Button>
              <Button
                type="submit"
                size="lg"
                block
                isLoading={loading}
                className="flex-1 font-bold"
              >
                {loading
                  ? t('send.booking')
                  : isBig
                  ? t('send.big_submit')
                  : t('send.submit', { price: formatRupiah(calculateFinalPrice()) })}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
