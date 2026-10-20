import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Snowflake, Zap, Droplets, Hammer, Wallet, Banknote, Minus, Plus, ClipboardList, Cctv, Flame, Umbrella, ArrowDownToLine, Wrench, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Sheet,
  Field,
  Input,
  Textarea,
  Select,
  Money,
  IconTile,
  Notice,
  PageHeader,
  cx,
} from '../components/ui';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { fetchCoordinates } from '../utils/osmHelpers';
import { VISIT_SLOTS, openSlots, firstBookableDate, witaToday, witaDatePlus, witaInstant } from '../utils/visitSchedule';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import PromoField from '../components/common/PromoField';
import { WALLET_ENABLED } from '../config/wallet';
import { useAuth } from '../context/AuthContext';
import { uploadPrivateImage } from '../utils/imageUpload';
import JobPhotoPicker from '../components/common/JobPhotoPicker';
import { localizeServiceItem } from '../utils/localizeDbText';

// ---- Tenun Laut booking helpers (presentational only) ----

// Placeholder used to drop a <Money> into a translated sentence, so an
// amount inside e.g. "Saldo: {{amount}}" still renders in mono.
const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

// "WiraX — Descriptive title" -> eyebrow + title.
function splitTitle(text) {
  const i = text.indexOf(' — ');
  return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [null, text];
}

// Selectable option: 2px brand border + radio when selected.
function ChoiceCard({ selected, onClick, leading, title, subtitle, trailing }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex w-full min-h-11 items-center gap-3 rounded-tile bg-card text-left transition-colors',
        selected ? 'border-2 border-brand px-[13px] py-[11px]' : 'border border-line px-3.5 py-3 hover:border-line-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-brand' : 'border-line-strong')}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {subtitle && <span className="text-[12px] text-ink-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </button>
  );
}

// Icons per category code; categories admins open later get the wrench.
const CATEGORY_ICONS = {
  AC: Snowflake, Listrik: Zap, Plumbing: Droplets, Tukang: Hammer,
  CCTV: Cctv, Las: Flame, Waterproofing: Umbrella, SumurBor: ArrowDownToLine,
};
const LEGACY_TITLES = {
  AC: 'Service AC & Cuci', Listrik: 'Instalasi Listrik', Plumbing: 'Pipa & Pompa Air', Tukang: 'Tukang Bangunan',
};

function GroupLabel({ children }) {
  return <p className="text-[13px] font-semibold text-ink">{children}</p>;
}

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export default function ServicePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  const [technicians, setTechnicians] = useState([]);
  // Bookable categories (migrations/0123): category rows of pricing_rules,
  // named from service_skills.
  const [categoryRows, setCategoryRows] = useState([]);
  const [skillNames, setSkillNames] = useState({});
  // "Pekerjaan lain": what the customer describes, and up to 3 photos.
  const [jobDesc, setJobDesc] = useState('');
  const [jobPhotos, setJobPhotos] = useState([]); // File[]
  const [techLoaded, setTechLoaded] = useState(false);
  // Price menu (migrations/0090): items per category, priced per unit.
  const [menu, setMenu] = useState([]);
  const [qty, setQty] = useState({}); // item code -> quantity in the open booking
  const [checkFee, setCheckFee] = useState(50000);
  const [selectedService, setSelectedService] = useState(null);
  // '' = let Wira pick (every technician with the skill is offered the job)
  const [selectedTechId, setSelectedTechId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1); // 1 = Pilih Layanan, 2 = Jadwal & Lokasi

  useEffect(() => {
    let cancelled = false;
    // Active technicians with at least one skill (migrations/0089); no
    // contact details are exposed.
    supabase.rpc('list_service_technicians').then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('list_service_technicians failed:', error);
      setTechnicians(Array.isArray(data) ? data : []);
      setTechLoaded(true);
    });
    // The prices admins set under Manajemen Harga; the server charges these.
    supabase.from('pricing_rules').select('*').eq('service_type', 'service').eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMenu(data.filter((r) => r.item_of).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)));
        setCategoryRows(data.filter((r) => !r.item_of && r.code !== 'CHECK_FEE')
          .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)));
        const fee = data.find((r) => r.code === 'CHECK_FEE');
        if (fee) setCheckFee(Number(fee.base_price));
      });
    supabase.from('service_skills').select('code, name').then(({ data }) => {
      if (!cancelled && data) setSkillNames(Object.fromEntries(data.map((r) => [r.code, r.name])));
    });
    return () => { cancelled = true; };
  }, []);

  // Form State
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [addressNote, setAddressNote] = useState('');
  const [serviceDate, setServiceDate] = useState(() => firstBookableDate());
  const [serviceTime, setServiceTime] = useState(() => openSlots(firstBookableDate())[0] || VISIT_SLOTS[0]);
  const timeSlots = openSlots(serviceDate);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // `id` matches pricing_rules.code and the technician skill code; `name`
  // stays Indonesian because it is stored as the order title that the
  // technician reads in the partner app (the first four keep their old
  // titles, which utils/localizeDbText translates). What the customer sees
  // comes from `service.categories.*` when the app knows the category.
  const categories = categoryRows.map((r) => ({
    id: r.code,
    icon: CATEGORY_ICONS[r.code] || Wrench,
    name: LEGACY_TITLES[r.code] || skillNames[r.code] || r.name,
    price: Number(r.base_price),
  }));
  // Translated name when the app knows the category, the admin's name otherwise.
  const categoryLabel = (c) => {
    if (!c) return '';
    const key = `service.categories.${c.id}`;
    const label = t(key);
    return label === key ? c.name : label;
  };
  const itemsFor = (cat) => menu.filter((m) => m.item_of === cat);
  const bookingItems = selectedService ? itemsFor(selectedService.id) : [];
  const chosenItems = bookingItems.filter((m) => (qty[m.code] || 0) > 0);
  const menuItems = bookingItems.filter((m) => !m.is_custom);
  const customItem = bookingItems.find((m) => m.is_custom) || null;
  const customChosen = !!customItem && (qty[customItem.code] || 0) > 0;
  const onlyCustom = customChosen && chosenItems.length === 1;
  // The check fee when "Pekerjaan lain" is the whole order; free next to
  // menu items (the technician is coming anyway). Same rule as the server.
  const customPrice = onlyCustom ? checkFee : 0;
  const itemsTotal = chosenItems.reduce(
    (sum, m) => sum + (m.is_custom ? customPrice : Number(m.base_price) * qty[m.code]), 0);
  const toggleCustom = () => {
    if (!customItem) return;
    setQty((q) => ({ ...q, [customItem.code]: customChosen ? 0 : 1 }));
  };
  const changeQty = (item, delta) => setQty((q) => ({
    ...q,
    [item.code]: Math.max(0, Math.min(item.max_qty || 10, (q[item.code] || 0) + delta)),
  }));
  const techsFor = (skill) => technicians.filter((tech) => (tech.skills || []).includes(skill));
  const selectedTech = technicians.find((tech) => tech.id === selectedTechId) || null;

  const handleOpenBooking = (cat, preselectedTech = null) => {
    setSelectedService(cat);
    setSelectedTechId(preselectedTech?.id || '');
    // Start with the first item of the category picked once ("Pekerjaan
    // lain" when the category has nothing else).
    const first = itemsFor(cat.id)[0];
    setQty(first ? { [first.code]: 1 } : {});
    setJobDesc('');
    setJobPhotos([]);
    const date = firstBookableDate();
    setServiceDate(date);
    setServiceTime(openSlots(date)[0] || VISIT_SLOTS[0]);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setBookingStep(1);
    setIsModalOpen(true);
  };

  const canProceed = chosenItems.length > 0 && (!customChosen || jobDesc.trim().length >= 10);

  const handleProceedToSchedule = () => {
    if (chosenItems.length === 0) {
      toast.error(t('service.pick_item'));
      return;
    }
    if (customChosen && jobDesc.trim().length < 10) {
      toast.error(t('service.custom_desc_required'));
      return;
    }
    setBookingStep(2);
  };

  // Arriving from a technician's profile (/service?tech=…&cat=…): open the
  // booking for that category with that technician chosen, once loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const techId = searchParams.get('tech');
    const cat = categories.find((c) => c.id === searchParams.get('cat'));
    if (!techId || !cat || !techLoaded || menu.length === 0) return;
    handleOpenBooking(cat, technicians.find((x) => x.id === techId) || null);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, techLoaded, menu.length]);

  const handleDateChange = (date) => {
    setServiceDate(date);
    const slots = openSlots(date);
    if (!slots.includes(serviceTime)) setServiceTime(slots[0] || '');
  };

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
      if (data.service_type && data.service_type !== 'service') throw new Error(t('promo.wrong_service'));

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
  usePendingPromo('service', promoCode, setPromoCode, handleCheckPromo);

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateFinalPrice = () => {
    // Itemised once the menu has loaded (0090); category price before that.
    const basePrice = bookingItems.length > 0 ? itemsTotal : (selectedService?.price || 0);
    if (!activePromo || onlyCustom) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error(t('common.login_required'));
      navigate('/login');
      return;
    }
    if (!selectedService) return;
    if (!address.trim()) {
      toast.error(t('common.address_required'));
      return;
    }
    if (bookingItems.length > 0 && chosenItems.length === 0) {
      toast.error(t('service.pick_item'));
      return;
    }
    if (customChosen && jobDesc.trim().length < 10) {
      toast.error(t('service.custom_desc_required'));
      return;
    }
    if (!serviceTime || !openSlots(serviceDate).includes(serviceTime)) {
      toast.error(t('service.slot_passed'));
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(t('service.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      // The pinned point (search, GPS or dragged pin) locates the job for
      // dispatch; a typed address without a pin is geocoded best-effort.
      let point = addressCoords;
      if (!point) {
        try { point = await fetchCoordinates(address); } catch (geoErr) { console.error('Geocode failed:', geoErr); }
      }

      // Job photos go to the private bucket first; the order keeps the paths.
      let photoPaths = [];
      if (customChosen && jobPhotos.length > 0) {
        try {
          photoPaths = await Promise.all(jobPhotos.map((f) => uploadPrivateImage(supabase, 'order-photos', user.id, f)));
        } catch (upErr) {
          console.error('Job photo upload failed:', upErr);
          toast.error(t('service.custom_photo_failed'));
          setLoading(false);
          return;
        }
      }

      const order = await addOrder({
        pickupLat: point?.lat ?? null,
        pickupLng: point?.lng ?? null,
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraService - ${selectedService.name}`,
        service: 'WiraService',
        serviceType: 'service',
        title: selectedService.name,
        details: `Jadwal: ${serviceDate} pukul ${serviceTime} • Lokasi: ${withAddressNote(address, addressNote)}`
          + (notes.trim() ? ` • Keluhan: ${notes.trim()}` : '')
          + (customChosen ? ` • Pekerjaan lain: ${jobDesc.trim()}` : ''),
        metadata: {
          scheduled_at: witaInstant(serviceDate, serviceTime),
          ...(chosenItems.length > 0 ? { items: chosenItems.map((m) => ({ code: m.code, qty: qty[m.code] })) } : {}),
          ...(customChosen ? { job: { description: jobDesc.trim(), photos: photoPaths } } : {}),
        },
        price: finalPrice,
        paymentMethod: paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='service' ('AC' | 'Listrik' | 'Plumbing' | 'Tukang'),
        // per the categories array above and migrations/0057's seed.
        rateCode: selectedService?.id || null,
        promoCode: onlyCustom ? null : (activePromo?.code || null),
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      setIsModalOpen(false);

      handleRemovePromo(); // don't let a used promo silently discount the next order
    } catch (err) {
      toast.error(t('service.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

  const [titleEyebrow, titleText] = splitTitle(t('service.title'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        eyebrow={titleEyebrow}
        title={titleText}
        subtitle={t('service.subtitle')}
        className="mb-0"
      />

      {/* Grid Kategori Jasa */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.filter((c) => !techLoaded || techsFor(c.id).length > 0).map((c) => {
          const Icon = c.icon;
          const count = techsFor(c.id).length;
          const unavailable = techLoaded && count === 0;
          return (
            <Card
              key={c.id}
              as="button"
              type="button"
              onClick={() => (unavailable ? toast(t('service.unavailable_toast')) : handleOpenBooking(c))}
              aria-disabled={unavailable || undefined}
              className={cx('flex flex-col items-start gap-3', unavailable && 'opacity-60')}
            >
              <IconTile tone={unavailable ? 'neutral' : 'brand'}><Icon size={20} /></IconTile>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold leading-snug text-ink">
                  {categoryLabel(c)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {withMoney(t('service.starting_from', { price: SLOT }), c.price, { className: 'text-ink' })}
                </span>
                {techLoaded && (
                  <span className={cx('text-[12px] font-medium', unavailable ? 'text-ink-muted' : 'text-success-ink')}>
                    {unavailable ? t('service.unavailable') : (t('service.available_badge') || 'Tersedia')}
                  </span>
                )}
              </span>
            </Card>
          );
        })}
      </div>

      {/* Big jobs: quotes instead of a fixed price (migrations/0093). Paid
          from WiraPay escrow, so web only (config/wallet). */}
      {WALLET_ENABLED && (
        <Card className="flex flex-col gap-3 border-brand-line bg-brand-soft/40 sm:flex-row sm:items-center">
          <IconTile tone="brand"><ClipboardList size={20} /></IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[14px] font-bold text-ink">{t('service.project_title')}</p>
            <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('service.project_desc')}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => navigate('/projects')}>{t('service.project_mine')}</Button>
            <Button onClick={() => navigate('/projects/new')}>{t('service.project_cta')}</Button>
          </div>
        </Card>
      )}

      {/* SHEET BOOKING TEKNISI */}
      <Sheet
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setBookingStep(1);
        }}
        closeLabel={t('common.close')}
        title={
          bookingStep === 1
            ? t('service.booking_title', { service: categoryLabel(selectedService) })
            : (t('service.step_2_title') || 'Jadwal & Lokasi Servis')
        }
        description={
          bookingStep === 1
            ? (selectedTech
                ? `${t('service.technician_line', { name: selectedTech.name })} • ${t('service.trust_verified_short') || 'Terverifikasi'}`
                : (t('service.sheet_auto_assign') || 'Teknisi dipilihkan Wira • Terverifikasi & Resmi'))
            : (`${categoryLabel(selectedService)} • ${t('service.step_2_of_2') || 'Langkah 2 dari 2'}`)
        }
        footer={
          bookingStep === 1 ? (
            <Button
              type="button"
              size="lg"
              block
              disabled={!canProceed}
              onClick={handleProceedToSchedule}
              className="flex items-center justify-between"
            >
              <span>{t('service.proceed_to_schedule') || 'Lanjut ke Jadwal & Alamat'}</span>
              {itemsTotal > 0 && (
                <span className="rounded bg-white/20 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                  <Money value={itemsTotal} /> →
                </span>
              )}
            </Button>
          ) : (
            <div className="flex w-full items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-1/3"
                onClick={() => setBookingStep(1)}
              >
                {t('common.back')}
              </Button>
              <Button
                type="submit"
                form="service-booking-form"
                size="lg"
                className="w-2/3"
                disabled={loading || !serviceTime || !address.trim()}
                isLoading={loading}
              >
                {loading ? t('common.processing') : t('service.submit')}
              </Button>
            </div>
          )
        }
      >
        {bookingStep === 1 ? (
          <div className="flex flex-col gap-3.5">
            {/* Daftar Layanan / Pekerjaan */}
            {bookingItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {menuItems.length > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <h3 className="text-[13.5px] font-bold text-ink">
                      {t('service.how_many_units') || 'Berapa unit yang ingin diservis?'}
                    </h3>
                    {menuItems.some((m) => (qty[m.code] || 0) > 0) && (
                      <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[11px] font-bold text-brand-ink">
                        {t('service.units_selected', {
                          count: menuItems.reduce((acc, m) => acc + (qty[m.code] || 0), 0),
                        })}
                      </span>
                    )}
                  </div>
                )}

                {menuItems.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {menuItems.map((rawItem) => {
                      const item = localizeServiceItem(rawItem, t);
                      const n = qty[item.code] || 0;
                      const isSelected = n > 0;
                      return (
                        <div
                          key={item.code}
                          className={cx(
                            'flex items-center justify-between gap-3 rounded-card p-3.5 transition-all',
                            isSelected
                              ? 'border-2 border-brand bg-brand-soft/25'
                              : 'border border-line bg-card hover:border-line-strong'
                          )}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[14px] font-bold leading-snug text-ink">{item.name}</span>
                              {isSelected && (
                                <span className="rounded bg-brand px-1.5 py-0.2 font-mono text-[10.5px] font-bold text-white">
                                  {n} {item.unit_label || 'Unit'}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <span className="text-[12px] leading-snug text-ink-muted">{item.description}</span>
                            )}
                            <span className={cx('font-mono text-[12.5px] font-bold', isSelected ? 'text-brand-ink' : 'text-ink')}>
                              <Money value={Number(item.base_price)} />
                              {item.unit_label && <span className="font-normal text-ink-muted"> / {item.unit_label}</span>}
                            </span>
                          </div>

                          {/* Stepper Ramah Jempol (Touch target >= 40px) */}
                          <div className={cx('flex items-center gap-1.5 rounded-control p-1 transition-colors', isSelected ? 'bg-card border border-line-strong' : 'bg-sunken border border-line')}>
                            <button
                              type="button"
                              onClick={() => changeQty(item, -1)}
                              disabled={n === 0}
                              aria-label={t('service.qty_less', { name: item.name })}
                              className={cx(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink font-bold transition-all',
                                n === 0 ? 'opacity-30 cursor-not-allowed' : 'bg-sunken hover:bg-line active:scale-95'
                              )}
                            >
                              <Minus size={18} />
                            </button>
                            <span className="w-7 text-center font-mono text-[16px] font-extrabold text-ink" aria-live="polite">
                              {n}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeQty(item, 1)}
                              disabled={n >= (item.max_qty || 10)}
                              aria-label={t('service.qty_more', { name: item.name })}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-brand text-white font-bold hover:bg-brand-hover active:scale-95 transition-all"
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pekerjaan Lain / Custom Item: First-Class Card */}
                {customItem && (
                  <div className="flex flex-col gap-2 pt-0.5">
                    <div
                      className={cx(
                        'flex flex-col gap-3 rounded-card p-4 transition-all',
                        customChosen
                          ? 'border-2 border-brand bg-brand-soft/25'
                          : 'border border-line bg-card hover:border-line-strong'
                      )}
                    >
                      <div
                        onClick={menuItems.length > 0 ? toggleCustom : undefined}
                        className={cx(
                          'flex items-start gap-3 select-none',
                          menuItems.length > 0 && 'cursor-pointer'
                        )}
                        role={menuItems.length > 0 ? 'button' : undefined}
                        tabIndex={menuItems.length > 0 ? 0 : undefined}
                        onKeyDown={
                          menuItems.length > 0
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleCustom();
                                }
                              }
                            : undefined
                        }
                      >
                        <IconTile tone={customChosen ? 'brand' : 'neutral'} size="md">
                          {menuItems.length === 0 && selectedService && CATEGORY_ICONS[selectedService.id] ? (
                            (() => {
                              const CatIcon = CATEGORY_ICONS[selectedService.id];
                              return <CatIcon size={20} />;
                            })()
                          ) : (
                            <Wrench size={18} />
                          )}
                        </IconTile>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h4 className="text-[14.5px] font-bold text-ink">
                                {menuItems.length === 0 ? categoryLabel(selectedService) : t('service.custom_title')}
                              </h4>
                              <Badge tone="brand">
                                <Sparkles size={11} className="mr-1 inline" aria-hidden="true" />
                                {menuItems.length === 0 ? (t('service.custom_primary_badge') || 'Survei & Pengecekan') : (t('service.custom_badge') || 'Kustom')}
                              </Badge>
                            </div>
                            {menuItems.length > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={customChosen ? 'primary' : 'secondary'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCustom();
                                }}
                                className="shrink-0 min-h-11 font-bold"
                                leftIcon={customChosen ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                              >
                                {customChosen ? (t('common.selected') || 'Dipilih') : (t('service.select_custom_cta') || 'Pilih')}
                              </Button>
                            ) : (
                              <Badge tone="success" dot className="shrink-0 font-semibold">
                                {t('common.selected') || 'Dipilih'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[12px] leading-relaxed text-ink-muted">
                            {menuItems.length === 0
                              ? (t('service.custom_only_desc') || 'Teknisi spesialis memeriksa kondisi di lapangan dan memberikan estimasi pekerjaan & sparepart secara transparan.')
                              : t('service.custom_desc')}
                          </p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            {onlyCustom ? (
                              <>
                                <span className="font-mono text-[13.5px] font-bold text-ink">
                                  <Money value={checkFee} />
                                </span>
                                <span className="text-[11.5px] text-ink-muted">
                                  ({t('service.check_fee_label') || 'Biaya Kunjungan Cek'})
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={cx('font-mono text-[13.5px] font-bold', customChosen ? 'text-success' : 'text-brand-ink')}>
                                  {menuItems.some((m) => (qty[m.code] || 0) > 0)
                                    ? (t('service.custom_price_free') || 'Gratis Biaya Kunjungan')
                                    : withMoney(t('service.custom_price_check', { fee: SLOT }), checkFee)}
                                </span>
                                {menuItems.some((m) => (qty[m.code] || 0) > 0) && (
                                  <span className="text-[11.5px] text-ink-muted">
                                    ({t('service.custom_combined_hint') || 'Termasuk kunjungan'})
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {customChosen && (
                        <div className="flex flex-col gap-3 border-t border-line/60 pt-3">
                          <Field
                            label={menuItems.length === 0 ? (t('service.custom_only_desc_label') || 'Ceritakan Masalah / Kebutuhan Servis') : t('service.custom_desc_label')}
                            htmlFor="service-job-desc"
                            required
                            hint={t('service.custom_desc_hint')}
                          >
                            <Textarea
                              id="service-job-desc"
                              rows={3}
                              maxLength={500}
                              value={jobDesc}
                              onChange={(e) => setJobDesc(e.target.value)}
                              placeholder={
                                menuItems.length === 0
                                  ? (t('service.custom_only_placeholder') || 'Contoh: Pompa air menyala tapi air tidak naik, atau perlu pembuatan sumur bor baru...')
                                  : t('service.custom_desc_placeholder')
                              }
                              required
                            />
                          </Field>
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[13px] font-semibold text-ink">
                              {t('service.custom_photos_label')} <span className="font-normal text-ink-muted">({t('common.optional') || 'opsional'})</span>
                            </span>
                            <p className="text-[12px] text-ink-muted">{t('service.custom_photos_hint')}</p>
                            <JobPhotoPicker files={jobPhotos} onChange={setJobPhotos} />
                          </div>
                          <Notice tone="brand">
                            {onlyCustom
                              ? withMoney(t('service.custom_check_note', { fee: SLOT }), checkFee)
                              : t('service.custom_combined_note')}
                          </Notice>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[12px] leading-relaxed text-ink-muted pt-1">
                  {withMoney(t('service.extra_note', { fee: SLOT }), checkFee, { className: 'text-ink' })}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* LANGKAH 2: JADWAL & ALAMAT */
          <form id="service-booking-form" onSubmit={handleConfirmOrder} className="flex flex-col gap-5">
            {/* Ringkasan Layanan yang Dipilih di Step 1 */}
            <div className="flex items-center justify-between rounded-card border border-brand-line bg-brand-soft/40 p-3.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-ink">
                  {t('service.selected_summary') || 'Layanan yang Dipesan'}
                </span>
                <span className="truncate text-[13.5px] font-bold text-ink">
                  {chosenItems
                    .map((m) =>
                      m.is_custom
                        ? (menuItems.length === 0 ? categoryLabel(selectedService) : t('service.custom_title'))
                        : `${localizeServiceItem(m, t).name} (${qty[m.code]}x)`
                    )
                    .join(', ') || t('service.custom_title')}
                </span>
                <span className="font-mono text-[13px] font-extrabold text-brand-ink">
                  <Money value={itemsTotal} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBookingStep(1)}
                className="shrink-0 rounded-control bg-card px-3 py-1.5 text-xs font-bold text-brand-ink border border-brand/30 hover:bg-sunken transition-colors"
              >
                {t('service.change_services') || 'Ubah'}
              </button>
            </div>

            {/* Tanggal & Jam */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('service.date_label')} htmlFor="service-date" required>
                <Input
                  id="service-date"
                  type="date"
                  value={serviceDate}
                  min={witaToday()}
                  max={witaDatePlus(7)}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="font-mono"
                  required
                />
              </Field>
              <Field label={t('service.time_label')} htmlFor="service-time">
                <Select
                  id="service-time"
                  value={serviceTime}
                  onChange={(e) => setServiceTime(e.target.value)}
                  disabled={timeSlots.length === 0}
                >
                  {timeSlots.length === 0 && <option value="">{t('service.no_slots')}</option>}
                  {timeSlots.map((time) => (
                    <option key={time} value={time}>
                      {t('service.time_option', { time })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Alamat & Map */}
            <AddressMapPicker
              id="service-address"
              label={t('service.address_label')}
              placeholder={t('service.address_placeholder')}
              address={address}
              onAddressChange={setAddress}
              coords={addressCoords}
              onCoordsChange={setAddressCoords}
              onNoteChange={setAddressNote}
              markerType="dropoff"
              pinLabel={t('service.address_label')}
            />
            <AddressNoteField
              id="service-address-note"
              address={address}
              lat={addressCoords?.lat}
              lng={addressCoords?.lng}
              note={addressNote}
              onNoteChange={setAddressNote}
            />

            {/* Catatan / Keluhan */}
            <Field label={t('service.complaint_label')} htmlFor="service-notes">
              <Input
                id="service-notes"
                type="text"
                placeholder={t('service.complaint_placeholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {/* Metode Pembayaran */}
            <div className="flex flex-col gap-2">
              <GroupLabel>{t('common.payment_method')}</GroupLabel>
              <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
                {WALLET_ENABLED && (
                  <ChoiceCard
                    selected={paymentMethod === 'WiraPay'}
                    onClick={() => setPaymentMethod('WiraPay')}
                    leading={<IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>}
                    title="WiraPay"
                    subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
                  />
                )}
                <ChoiceCard
                  selected={paymentMethod === 'Tunai'}
                  onClick={() => setPaymentMethod('Tunai')}
                  leading={<IconTile tone="neutral" size="sm"><Banknote size={18} /></IconTile>}
                  title={t('common.pay_cash')}
                  subtitle={t('common.pay_cash_to_technician')}
                />
              </div>
              <div className="flex items-center gap-2 rounded-control border border-line bg-sunken p-2.5 text-xs text-ink-muted">
                <span>💵</span>
                <span>{t('service.cash_payment_note') || 'Bayar tunai langsung ke teknisi setelah selesai dan diuji.'}</span>
              </div>
              {paymentMethod === 'WiraPay' && balance < calculateFinalPrice() && (
                <Notice tone="danger">{t('service.insufficient_balance')}</Notice>
              )}
            </div>

            {/* Kode Promo */}
            {onlyCustom ? (
              <p className="text-[12px] text-ink-muted">{t('service.custom_no_promo')}</p>
            ) : (
              <PromoField
                t={t}
                id="service-promo"
                activePromo={activePromo}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                onApply={handleCheckPromo}
                onRemove={handleRemovePromo}
                checking={checkingPromo}
                error={promoError}
              />
            )}

            {/* Ringkasan Estimasi Biaya */}
            <dl className="flex flex-col rounded-card border border-line bg-card p-4 text-[13px]">
              <SummaryRow label={t('service.estimate_label')} strong className="text-[14px]">
                <span className="flex flex-col items-end">
                  {activePromo && !onlyCustom && (
                    <Money value={bookingItems.length > 0 ? itemsTotal : (selectedService?.price || 0)} tone="muted" className="text-[12px] line-through" />
                  )}
                  <Money value={calculateFinalPrice()} className="text-[17px] font-bold text-ink" />
                </span>
              </SummaryRow>
            </dl>
            {customChosen && (
              <p className="text-[12px] text-ink-muted">
                {t('service.big_job_note')}{' '}
                <Link to="/support" className="font-semibold text-brand-ink underline-offset-2 hover:underline">{t('service.big_job_cta')}</Link>
              </p>
            )}
          </form>
        )}
      </Sheet>
    </div>
  );
}
