import { useRef, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import {
  Button,
  Card,
  Badge,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  EmptyState,
  Spinner,
  Input,
  Segmented,
  cx,
} from '../components/ui';
import SafeImg from '../components/ui/SafeImg';
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import PromoField from '../components/common/PromoField';
import {
  Star,
  Clock,
  Minus,
  Plus,
  ShoppingBag,
  MapPin,
  ArrowRight,
  Store,
  Wallet,
  Banknote,
  UtensilsCrossed,
  Search,
  MessageSquarePlus,
  Trash2,
  Check,
} from 'lucide-react';
import { fetchRoute, fetchCoordinates } from '../utils/osmHelpers';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { withAddressNote } from '../utils/addressNote';
import { usePendingPromo } from '../utils/pendingPromo';
import { isPromoExpired } from '../utils/promoDates';
import { friendlyError } from '../utils/friendlyError';
import { WALLET_ENABLED } from '../config/wallet';

const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

// Selectable option (Tenun Laut): 2px brand border + radio when selected.
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

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

// Interactive cart item in checkout: quantity stepper + item note inline editor
function CheckoutItemCard({ item, onUpdateQty, onRemove, onUpdateNote, t }) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(item.note || '');

  const handleSaveNote = () => {
    onUpdateNote(item.id, noteText.trim());
    setEditingNote(false);
  };

  const handleRemoveNote = () => {
    setNoteText('');
    onUpdateNote(item.id, '');
    setEditingNote(false);
  };

  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-card p-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-[14px] font-semibold text-ink leading-snug">{item.name}</h4>
          <Money value={item.price} className="text-[12.5px] text-ink-muted" />
        </div>
        <div className="flex items-center rounded-control border border-line-strong bg-card">
          <button
            type="button"
            aria-label={`Kurangi ${item.name}`}
            onClick={() => {
              if (item.qty > 1) onUpdateQty(item.id, item.qty - 1);
              else onRemove(item.id);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-l-control text-ink hover:bg-sunken"
          >
            {item.qty > 1 ? <Minus size={15} /> : <Trash2 size={15} className="text-danger" />}
          </button>
          <span className="min-w-[28px] text-center font-mono text-[13.5px] font-medium text-ink" aria-live="polite">
            {item.qty}
          </span>
          <button
            type="button"
            aria-label={`Tambah ${item.name}`}
            onClick={() => onUpdateQty(item.id, item.qty + 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-r-control text-brand-ink hover:bg-brand-soft"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Item Note Section */}
      {editingNote ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <Input
            size="sm"
            autoFocus
            maxLength={120}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveNote();
              }
            }}
            placeholder={t('restaurant.item_note_placeholder')}
            className="h-9 text-[12.5px]"
          />
          <div className="flex items-center justify-end gap-2">
            {item.note && (
              <Button size="sm" variant="ghost" onClick={handleRemoveNote} className="text-danger">
                {t('restaurant.remove_note')}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditingNote(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveNote} leftIcon={<Check size={14} />}>
              {t('restaurant.save_note')}
            </Button>
          </div>
        </div>
      ) : item.note ? (
        <div className="flex items-center justify-between gap-2 rounded-control bg-sunken px-2.5 py-1.5 text-[12px] text-ink">
          <span className="truncate italic text-ink-muted">
            <span className="font-semibold not-italic text-ink">{t('restaurant.note_label')}:</span> {item.note}
          </span>
          <button
            type="button"
            onClick={() => {
              setNoteText(item.note);
              setEditingNote(true);
            }}
            className="shrink-0 font-medium text-brand-ink hover:underline"
          >
            {t('restaurant.edit_note')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNoteText('');
            setEditingNote(true);
          }}
          className="inline-flex items-center gap-1.5 self-start text-[12px] font-medium text-brand-ink hover:underline"
        >
          <MessageSquarePlus size={13} aria-hidden="true" />
          <span>{t('restaurant.add_note')}</span>
        </button>
      )}

      <div className="flex items-baseline justify-between border-t border-line/60 pt-2 text-[13px]">
        <span className="text-xs text-ink-muted">Subtotal</span>
        <Money value={item.price * item.qty} className="font-medium text-ink" />
      </div>
    </li>
  );
}

export default function RestaurantPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [rest, setRest] = useState(null);

  const { cart, addItem, removeItem, updateQty, updateNote, clearCart, setRestaurant, subtotal } = useCart();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  const [step, setStep] = useState('menu'); // 'menu' | 'checkout'
  // Alamat pengantaran diinisialisasi kosong (bukan hardcoded) dan otomatis diisi dari saved_addresses jika ada
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [merchantCoords, setMerchantCoords] = useState(null);
  const [distance, setDistance] = useState(0);
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState(5000);
  const [fetchError, setFetchError] = useState(false);

  // Kategori menu & filter pencarian dalam resto
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [menuSearch, setMenuSearch] = useState('');

  // 1. Ambil data profil alamat tersimpan pengguna (jika login)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('saved_addresses')
      .select('address, lat, lng, note')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (data.address) {
          setDeliveryAddress((prev) => (prev ? prev : data.address));
          if (data.lat != null && data.lng != null) {
            setDeliveryCoords((prev) => (prev ? prev : { lat: Number(data.lat), lng: Number(data.lng) }));
          }
          if (data.note) {
            setDeliveryNote((prev) => (prev ? prev : data.note));
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 2. Ambil data restoran & menu
  useEffect(() => {
    const fetchRest = async () => {
      setFetchError(false);
      const { data: merchantData, error: merchantError } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', id)
        .single();

      if (merchantError || !merchantData) {
        console.error(merchantError);
        setFetchError(true);
        return;
      }

      if (merchantData) {
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('merchant_id', id);

        setRest({
          ...merchantData,
          deliveryTime: merchantData.delivery_time,
          menuItems: productsData || [],
        });

        let mCoords = { lat: -8.5833, lng: 116.1167 };
        if (merchantData.lat && merchantData.lng) {
          mCoords = { lat: parseFloat(merchantData.lat), lng: parseFloat(merchantData.lng) };
        } else if (merchantData.address) {
          const coords = await fetchCoordinates(merchantData.address);
          if (coords) mCoords = coords;
        }
        setMerchantCoords(mCoords);
      }
    };
    if (id) fetchRest();
  }, [id]);

  // 3. Formula Ongkir dari pricing_rules food_delivery
  const [feeRule, setFeeRule] = useState({ base: 5000, perKm: 2000 });
  useEffect(() => {
    supabase
      .from('pricing_rules')
      .select('base_price, per_km_rate')
      .eq('service_type', 'food_delivery')
      .eq('code', 'default')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFeeRule({ base: Number(data.base_price) || 0, perKm: Number(data.per_km_rate) || 0 });
      });
  }, []);

  // 4. Hitung rute & ongkos kirim dinamis jika koordinat valid
  useEffect(() => {
    if (merchantCoords && deliveryCoords) {
      let cancelled = false;
      const getRoute = async () => {
        const res = await fetchRoute(merchantCoords, deliveryCoords);
        if (cancelled) return;
        if (res && res.distance) {
          const distKm = res.distance / 1000;
          setDistance(distKm);
          setDynamicDeliveryFee(Math.ceil((feeRule.base + Math.ceil(distKm) * feeRule.perKm) / 500) * 500);
        } else {
          setDynamicDeliveryFee(feeRule.base || 5000);
        }
      };
      getRoute();
      return () => {
        cancelled = true;
      };
    } else {
      setDistance(0);
      setDynamicDeliveryFee(feeRule.base || 5000);
    }
  }, [merchantCoords, deliveryCoords, feeRule]);

  // Promo referral / banner dari Beranda
  const applyPromoRef = useRef(null);
  usePendingPromo('food', promoCode, setPromoCode, () => applyPromoRef.current?.(), !!rest);

  // Kategori menu unik dari item restoran
  const categories = useMemo(() => {
    if (!rest?.menuItems || rest.menuItems.length === 0) return [];
    const set = new Set();
    rest.menuItems.forEach((m) => {
      if (m.category && m.category.trim()) set.add(m.category.trim().toLowerCase());
    });
    return ['all', ...Array.from(set)];
  }, [rest?.menuItems]);

  const getCategoryLabel = (cat) => {
    if (cat === 'all') return t('restaurant.category_all');
    if (cat === 'makanan') return 'Makanan';
    if (cat === 'minuman') return 'Minuman';
    if (cat === 'snack') return 'Camilan';
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  };

  const filteredMenuItems = useMemo(() => {
    if (!rest?.menuItems) return [];
    return rest.menuItems.filter((item) => {
      const itemCat = (item.category || '').toLowerCase();
      const matchCat = selectedCategory === 'all' || itemCat === selectedCategory;
      const matchSearch =
        !menuSearch.trim() ||
        item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(menuSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [rest?.menuItems, selectedCategory, menuSearch]);

  if (fetchError) {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState
          icon={<Store size={24} />}
          title={t('restaurant.not_found_title')}
          description={t('restaurant.not_found_desc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
              <Button onClick={() => navigate('/food')}>{t('restaurant.back_to_food')}</Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!rest) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status">
        <Spinner size={24} className="text-brand-ink" />
        <p className="text-sm">{t('restaurant.loading')}</p>
      </div>
    );
  }

  const grandTotal = Math.max(0, subtotal + dynamicDeliveryFee - discount);
  const isClosed = rest.is_open === false;

  const handleAddItem = (item) => {
    if (isClosed) return;
    if (cart.restaurant && cart.restaurant.id !== rest.id && cart.items.length > 0) {
      if (window.confirm(t('restaurant.switch_restaurant_confirm'))) {
        clearCart();
        setRestaurant(rest);
        addItem({ ...item, qty: 1 });
      }
      return;
    }
    if (!cart.restaurant) {
      setRestaurant(rest);
    }
    addItem({ ...item, qty: 1 });
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
      if (data.service_type && data.service_type !== 'food') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      const promoDiscount =
        data.type === 'Percentage'
          ? Math.round((subtotal * Number(data.discount)) / 100)
          : Number(data.discount) || 0;
      setDiscount(Math.max(0, Math.min(promoDiscount, subtotal)));
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
      setActivePromo(null);
      setDiscount(0);
    } finally {
      setCheckingPromo(false);
    }
  };
  applyPromoRef.current = handleCheckPromo;

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setDiscount(0);
  };

  const handleConfirmOrder = async () => {
    if (cart.items.length === 0) {
      toast.error(t('restaurant.empty_cart'));
      return;
    }
    if (!user) {
      toast.error(t('restaurant.login_required'));
      navigate('/login');
      return;
    }
    if (!deliveryAddress.trim() || !deliveryCoords) {
      toast.error(t('restaurant.delivery_address_required'));
      return;
    }
    if (paymentMethod === 'WiraPay' && balance < grandTotal) {
      toast.error(t('restaurant.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const itemsSummary = cart.items
        .map((i) => `${i.qty}x ${i.name}${i.note ? ` (${i.note})` : ''}`)
        .join(', ');

      const order = await addOrder({
        paymentDescription: `WiraFood - ${rest.name}`,
        serviceType: 'food',
        merchantId: rest.id,
        title: rest.name,
        details: `${itemsSummary} — Antar ke: ${withAddressNote(deliveryAddress, deliveryNote)}`,
        price: grandTotal,
        deliveryFee: dynamicDeliveryFee,
        dropoffLat: deliveryCoords.lat,
        dropoffLng: deliveryCoords.lng,
        pickupLat: merchantCoords?.lat,
        pickupLng: merchantCoords?.lng,
        paymentMethod: paymentMethod,
        metadata: {
          items: cart.items.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            price: i.price,
            note: i.note || null,
          })),
          subtotal: subtotal,
          discount: discount,
        },
        distanceMeters: distance > 0 ? Math.round(distance * 1000) : null,
        promoCode: activePromo?.code || null,
      });

      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      clearCart();
      handleRemovePromo();
      toast.success(t('restaurant.order_placed'));
    } catch (err) {
      toast.error(t('restaurant.order_failed', { message: err.userMessage || friendlyError(err) }), {
        id: 'order-create-error',
      });
    }
    setLoading(false);
  };

  const totalItemsCount = cart.items.reduce((acc, curr) => acc + curr.qty, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-32">
      {/* HEADER NAVIGASI */}
      {step === 'menu' ? (
        <PageHeader
          back="/food"
          backLabel={t('common.back')}
          eyebrow={rest.category}
          title={rest.name}
          subtitle={
            rest.address ? (
              <span className="inline-flex items-start gap-1">
                <MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" /> {rest.address}
              </span>
            ) : null
          }
          className="mb-0"
        />
      ) : (
        <PageHeader
          back="#"
          onBack={() => setStep('menu')}
          backLabel={t('restaurant.checkout_back_to_menu')}
          title={t('restaurant.checkout_step_title')}
          subtitle={t('restaurant.delivery_from_merchant', { name: rest.name })}
          className="mb-0"
        />
      )}

      {/* ============================================================== */}
      {/* TAMPILAN 1: DAFTAR MENU RESTORAN                              */}
      {/* ============================================================== */}
      {step === 'menu' && (
        <>
          {/* Card Info Resto */}
          <Card padding="none" className="overflow-hidden">
            <SafeImg
              icon={UtensilsCrossed}
              src={rest.image}
              alt={rest.name}
              className="h-44 w-full bg-sunken object-cover sm:h-56"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Star size={14} className="fill-pay text-pay" aria-hidden="true" />
                <span className="font-mono">{rest.rating ?? '–'}</span>
              </span>
              {rest.deliveryTime && (
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Clock size={14} aria-hidden="true" />
                  <span className="font-mono">{rest.deliveryTime}</span>
                </span>
              )}
              {isClosed ? (
                <Badge tone="neutral" dot className="ml-auto">
                  {t('restaurant.closed')}
                </Badge>
              ) : (
                <Badge tone="success" dot className="ml-auto">
                  {t('restaurant.open_now')}
                </Badge>
              )}
            </div>
          </Card>

          {isClosed && <Notice tone="warning">{t('restaurant.closed_notice')}</Notice>}

          {/* Filter Pencarian & Kategori Menu */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeader title={t('restaurant.menu_title')} className="mb-0" />
              <span className="text-xs text-ink-muted">
                {filteredMenuItems.length} menu
              </span>
            </div>

            {rest.menuItems.length >= 4 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
                  size={16}
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label={t('restaurant.search_menu_placeholder')}
                  placeholder={t('restaurant.search_menu_placeholder')}
                  className="pl-10 text-[13.5px]"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                />
              </div>
            )}

            {categories.length > 2 && (
              <Segmented
                scroll
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={categories.map((c) => ({ value: c, label: getCategoryLabel(c) }))}
                className="w-full"
              />
            )}

            {filteredMenuItems.length === 0 ? (
              <EmptyState
                icon={<UtensilsCrossed size={22} />}
                title={t('restaurant.no_menu_found')}
                action={
                  menuSearch ? (
                    <Button variant="secondary" size="sm" onClick={() => setMenuSearch('')}>
                      {t('common.clear')}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <Card padding="none" className="divide-y divide-line overflow-hidden">
                {filteredMenuItems.map((item) => {
                  const inCart = cart.items.find((i) => i.id === item.id);
                  const isAvailable = item.is_available ?? true;

                  return (
                    <div
                      key={item.id}
                      className={cx('flex gap-3.5 p-3.5 transition-colors', !isAvailable && 'opacity-60')}
                    >
                      {item.image && (
                        <SafeImg
                          icon={UtensilsCrossed}
                          src={item.image}
                          alt={item.name}
                          className="h-20 w-20 shrink-0 rounded-control bg-sunken object-cover"
                        />
                      )}

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h3 className="text-[14px] font-semibold leading-snug text-ink">{item.name}</h3>
                        {item.description && (
                          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                            {item.description}
                          </p>
                        )}

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                          <Money value={item.price} className="text-[14px] font-medium text-ink" />

                          {!isAvailable ? (
                            <Badge tone="neutral">{t('restaurant.sold_out')}</Badge>
                          ) : inCart ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="inline-flex items-center rounded-control border border-line-strong bg-card">
                                <button
                                  type="button"
                                  aria-label={`− ${item.name}`}
                                  onClick={() => {
                                    if (inCart.qty > 1) {
                                      updateQty(item.id, inCart.qty - 1);
                                    } else {
                                      removeItem(item.id);
                                    }
                                  }}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-l-control text-ink hover:bg-sunken"
                                >
                                  <Minus size={15} />
                                </button>
                                <span
                                  className="min-w-[28px] text-center font-mono text-[14px] font-medium text-ink"
                                  aria-live="polite"
                                >
                                  {inCart.qty}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`+ ${item.name}`}
                                  onClick={() => handleAddItem(item)}
                                  disabled={isClosed}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-r-control text-brand-ink hover:bg-brand-soft disabled:opacity-40 disabled:hover:bg-transparent"
                                >
                                  <Plus size={15} />
                                </button>
                              </div>
                              {inCart.note && (
                                <span className="max-w-[130px] truncate text-[11px] text-ink-muted" title={inCart.note}>
                                  📝 {inCart.note}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              disabled={isClosed}
                              leftIcon={<Plus size={16} />}
                              onClick={() => handleAddItem(item)}
                            >
                              {t('restaurant.add')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>

          {/* FLOATING CART BAR DI BAWAH (MENU STEP) */}
          {cart.items.length > 0 && (
            <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
              <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-card bg-brand py-2.5 pl-3.5 pr-2.5 text-white shadow-pop">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-white/10"
                  aria-hidden="true"
                >
                  <ShoppingBag size={20} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-[12px] text-white/75">
                    {t('restaurant.items_selected', { count: totalItemsCount })}
                  </p>
                  <Money value={subtotal} className="text-[16px] font-medium" />
                </div>
                <Button
                  variant="on-brand"
                  rightIcon={<ArrowRight size={16} />}
                  disabled={isClosed}
                  onClick={() => {
                    setStep('checkout');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {t('restaurant.to_checkout')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* TAMPILAN 2: HALAMAN CHECKOUT LENGKAP                           */}
      {/* ============================================================== */}
      {step === 'checkout' && (
        <div className="flex flex-col gap-4">
          {/* 1. Alamat Pengantaran (Collapsible Map Tanpa Scroll Trap) */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title={t('restaurant.delivery_address')} className="mb-0" />
            <AddressMapPicker
              id="food-delivery-address"
              label={t('restaurant.delivery_address')}
              placeholder={t('restaurant.delivery_address_placeholder')}
              address={deliveryAddress}
              onAddressChange={setDeliveryAddress}
              coords={deliveryCoords}
              onCoordsChange={setDeliveryCoords}
              onNoteChange={setDeliveryNote}
              markerType="dropoff"
              pinLabel={t('restaurant.delivery_pin_label')}
              collapsible={true}
              defaultExpanded={false}
            />
            <AddressNoteField
              id="delivery-note"
              address={deliveryAddress}
              lat={deliveryCoords?.lat}
              lng={deliveryCoords?.lng}
              note={deliveryNote}
              onNoteChange={setDeliveryNote}
            />
          </Card>

          {/* 2. Rincian Item Keranjang & Catatan Khusus */}
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionHeader title={t('restaurant.order_summary')} className="mb-0" />
              <button
                type="button"
                onClick={() => setStep('menu')}
                className="text-xs font-semibold text-brand-ink hover:underline"
              >
                + {t('restaurant.edit_items')}
              </button>
            </div>

            <ul className="flex flex-col gap-2.5">
              {cart.items.map((item) => (
                <CheckoutItemCard
                  key={item.id}
                  item={item}
                  onUpdateQty={updateQty}
                  onRemove={(itemId) => {
                    removeItem(itemId);
                    if (cart.items.length <= 1) setStep('menu');
                  }}
                  onUpdateNote={updateNote}
                  t={t}
                />
              ))}
            </ul>

            {/* Input Promo */}
            <div className="border-t border-line pt-3">
              <PromoField
                id="food-promo"
                activePromo={activePromo}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                onApply={handleCheckPromo}
                onRemove={handleRemovePromo}
                checking={checkingPromo}
                error={promoError}
              />
            </div>

            {/* Hitung Rincian Biaya */}
            <dl className="flex flex-col gap-2 border-t border-line pt-3.5 text-[13px]">
              <SummaryRow label={t('restaurant.subtotal')}>
                <Money value={subtotal} />
              </SummaryRow>
              <SummaryRow label={t('restaurant.delivery_fee')}>
                {deliveryCoords ? (
                  <Money value={dynamicDeliveryFee} />
                ) : (
                  <span className="text-[12px] italic text-ink-muted">
                    {t('restaurant.calculating_delivery')}
                  </span>
                )}
              </SummaryRow>
              {distance > 0 && (
                <SummaryRow label={t('restaurant.delivery_distance')} className="text-[12px]">
                  <span className="font-mono text-ink-muted">{distance.toFixed(1)} km</span>
                </SummaryRow>
              )}
              {discount > 0 && (
                <SummaryRow label={t('restaurant.discount')}>
                  <Money value={discount} sign="minus" tone="in" />
                </SummaryRow>
              )}
              <SummaryRow
                label={t('restaurant.grand_total')}
                strong
                className="mt-1 border-t border-line pt-3 text-[14px]"
              >
                <Money value={grandTotal} className="text-[17px] font-medium" />
              </SummaryRow>
            </dl>
          </Card>

          {/* 3. Metode Pembayaran */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title={t('restaurant.choose_payment')} className="mb-0" />
            <div role="radiogroup" aria-label={t('restaurant.choose_payment')} className="flex flex-col gap-2.5">
              {WALLET_ENABLED && (
                <ChoiceCard
                  selected={paymentMethod === 'WiraPay'}
                  onClick={() => setPaymentMethod('WiraPay')}
                  leading={
                    <IconTile tone="pay" size="sm">
                      <Wallet size={18} />
                    </IconTile>
                  }
                  title="WiraPay"
                  subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
                />
              )}
              <ChoiceCard
                selected={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                leading={
                  <IconTile tone="neutral" size="sm">
                    <Banknote size={18} />
                  </IconTile>
                }
                title={t('common.pay_cash_cod')}
                subtitle={t('common.pay_cash_to_courier')}
              />
            </div>
            {paymentMethod === 'WiraPay' && balance < grandTotal && (
              <Notice tone="danger">{t('restaurant.insufficient_balance')}</Notice>
            )}
          </Card>

          {/* STICKY BOTTOM CHECKOUT CTA */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-stretch gap-2.5 rounded-card border border-line bg-card p-2.5 shadow-pop">
              <Button
                size="lg"
                className="flex-1"
                onClick={handleConfirmOrder}
                disabled={loading || isClosed || !deliveryAddress.trim() || !deliveryCoords}
                isLoading={loading}
              >
                {loading
                  ? t('common.processing')
                  : !deliveryAddress.trim() || !deliveryCoords
                  ? t('restaurant.delivery_address_required')
                  : withMoney(t('restaurant.place_order', { price: SLOT }), grandTotal)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
