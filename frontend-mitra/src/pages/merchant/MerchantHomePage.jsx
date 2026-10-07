import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { StatTile } from '../../components/shared/UIComponents';
import { Card, Badge, Button, Sheet, Money, IconTile, Notice, cx } from '../../components/ui';
import { Store, TrendingUp, ShoppingBag, BellRing, MessageCircle, Home, UtensilsCrossed, Building2, ChevronRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { parseOrderDetails } from '../../utils/formatters';
import { fetchPendingOrders, acceptOrder, completeOrder, updateOrderStatus, subscribeToMerchantOrders, merchantEarnedAmount, loadCommissionRates, orderErrorMessage } from '../../services/orderService';
import { OrderStatus } from '../../constants/orderStatus';
import { EARNINGS_COLUMNS, startOfTodayISO } from '../../utils/earnings';
import useMyMerchants from '../../hooks/useMyMerchants';

// Display-only: food orders store their items as a JSON array in `details`;
// list them one per line with the quantity in mono. Anything else (villa
// notes, free text) falls back to the existing parseOrderDetails string.
const parseItems = (details) => {
  if (Array.isArray(details)) return details.length ? details : null;
  if (typeof details !== 'string') return null;
  try {
    const parsed = JSON.parse(details);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
};

const OrderItems = ({ details, fallback }) => {
  const items = parseItems(details);
  if (!items) {
    return <p className="text-[13px] leading-relaxed text-ink-muted">{parseOrderDetails(details) || fallback}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-baseline gap-2.5 text-[14px] text-ink">
          <span className="w-8 shrink-0 font-mono font-medium text-ink-muted">{item.quantity || 1}×</span>
          <span className="min-w-0 flex-1 break-words">{item.name || 'Item'}</span>
        </li>
      ))}
    </ul>
  );
};

// Stable no-op: the incoming-order sheet cannot be dismissed, and Sheet re-runs
// its focus effect whenever onClose changes identity.
const noop = () => {};

// Store open/closed switch: 44px tap target, state also shown by a Badge.
const Switch = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className="inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full"
  >
    <span className={cx('relative h-8 w-14 rounded-full transition-colors duration-200', checked ? 'bg-success' : 'bg-line-strong')}>
      <span className={cx('absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-0')} />
    </span>
  </button>
);

const MerchantHomePage = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  // Read by the realtime/polling effect below without being one of its deps:
  // depending on activeOrder tore the channel down and rebuilt it on every
  // status change, dropping orders that arrived in between.
  const activeOrderRef = useRef(activeOrder);
  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);

  const [todayOrders, setTodayOrders] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);

  // Every property this owner runs on this portal (several villas, or one
  // restaurant): stats, incoming orders and the realtime feed cover all.
  const { merchants, ids: merchantIds, kind } = useMyMerchants();
  const idsKey = merchantIds.join(',');
  const merchantId = merchantIds.length ? merchantIds : null;
  const propertyName = (order) => merchants.find((m) => m.id === order?.merchant_id)?.name;
  const liveCount = merchants.filter((m) => !m.listing_status || m.listing_status === 'approved').length;
  // Deactivated by an admin (migrations/0101): hidden from customers.
  const suspended = merchants.filter((m) => m.listing_status === 'suspended');

  useEffect(() => {
    const fetchStats = async () => {
      if (!idsKey) return;
      await loadCommissionRates(supabase);
      const { data } = await supabase
        .from('orders')
        .select(EARNINGS_COLUMNS)
        .in('merchant_id', idsKey.split(','))
        .gte('created_at', startOfTodayISO());

      if (data) {
        setTodayOrders(data.length);
        // Real merchant share per migrations/0028's payout trigger, not
        // raw total_price (which for food also includes the delivery fee
        // the driver earns, and for either order type includes the 20%
        // platform commission the merchant never sees) - see
        // merchantEarnedAmount's doc comment in orderService.js.
        const earnings = data.filter(d => d.status === 'completed').reduce((sum, d) => sum + merchantEarnedAmount(d), 0);
        setTodayEarnings(earnings);
      }
    };
    fetchStats();
  }, [idsKey]);

  useEffect(() => {
    if (!isOpen || !merchantId) {
      setIncomingOrder(null);
      return;
    }

    const checkPendingOrders = async () => {
      if (activeOrderRef.current) return;
      try {
        const pending = await fetchPendingOrders(supabase, 'merchant', merchantId);
        const latest = pending[0];
        if (latest) {
          setIncomingOrder(prev => {
            if (!prev || prev.id !== latest.id) {
              toast.success('Ada pesanan menunggu!', { icon: isVillaOrder(latest) ? <Home size={18} className="text-brand-ink" /> : <UtensilsCrossed size={18} className="text-brand-ink" /> });
              return latest;
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('checkPendingOrders failed:', err);
      }
    };

    checkPendingOrders();

    const interval = setInterval(() => {
      checkPendingOrders();
    }, 10000);

    const unsubscribe = subscribeToMerchantOrders(supabase, merchantId, (order) => {
      if (!activeOrderRef.current) {
        setIncomingOrder(order);
        toast.success(isVillaOrder(order) ? 'Permintaan Reservasi Baru Masuk!' : 'Pesanan Makanan Baru Masuk!', { icon: isVillaOrder(order) ? <Home size={18} className="text-brand-ink" /> : <UtensilsCrossed size={18} className="text-brand-ink" /> });
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  // merchantId is derived from idsKey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, idsKey]);

  const isVillaOrder = (order) => order && (order.service_type === 'villa' || order.service_type === 'WiraVilla');

  const handleAcceptOrder = async () => {
    if (!incomingOrder) return;
    try {
      const accepted = await acceptOrder(supabase, incomingOrder.id, incomingOrder.merchant_id, 'merchant');
      setActiveOrder(accepted);
      setIncomingOrder(null);
      toast.success(isVillaOrder(accepted) ? 'Reservasi Dikonfirmasi!' : 'Pesanan Diterima! Silakan siapkan makanan.');
    } catch (err) {
      toast.error(orderErrorMessage(err, 'Pesanan sudah diproses.'));
      setIncomingOrder(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (!activeOrder) return;
    try {
      if (isVillaOrder(activeOrder)) {
        // Villa reservations have no prep/delivery leg - ACCEPTED -> COMPLETED
        // directly is correct here, and the DB payout trigger credits the
        // merchant right away on this same transition.
        await completeOrder(supabase, activeOrder.id, activeOrder.merchant_id, 'merchant');
        setActiveOrder(null);
        toast.success('Reservasi Selesai!');
        setTodayOrders(prev => prev + 1);
        // Villa's delivery_fee is always 0, so merchantEarnedAmount here is
        // total_price minus the villa commission (admin-set, migrations/0099),
        // or minus the whole price plus that share for a Tunai booking the
        // merchant collected in cash (migrations/0075).
        setTodayEarnings(prev => prev + merchantEarnedAmount(activeOrder));
      } else {
        // Food: this button means "I've finished preparing it," NOT "hand
        // it to a driver" - a driver hasn't picked it up yet. Route through
        // PREPARING -> READY (VALID_TRANSITIONS requires PREPARING as an
        // intermediate hop) so the order actually becomes visible to
        // drivers, instead of jumping straight to COMPLETED and skipping
        // the driver leg entirely.
        await updateOrderStatus(supabase, activeOrder.id, OrderStatus.PREPARING, activeOrder.merchant_id, 'merchant');
        await updateOrderStatus(supabase, activeOrder.id, OrderStatus.READY, activeOrder.merchant_id, 'merchant');
        setActiveOrder(null);
        toast.success('Pesanan Siap! Menunggu driver mengambil.');
        setTodayOrders(prev => prev + 1);
        // No earnings bump here: the order hasn't reached 'completed' (no
        // driver has delivered it yet), so the DB payout trigger hasn't
        // credited the merchant anything yet either - adding to
        // todayEarnings now would be both premature and the wrong amount.
      }
    } catch (err) {
      toast.error('Gagal menyelesaikan pesanan');
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Store identity + open/closed control: this drives what customers see */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <IconTile tone="brand" size="md"><Store size={20} /></IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="break-words text-[18px] font-extrabold leading-tight tracking-tight text-ink">{user?.name || 'Warung Anda'}</h1>
            {activeOrder ? (
              <span><Badge tone="brand" dot>{isVillaOrder(activeOrder) ? 'Reservasi Aktif...' : 'Sedang Memasak...'}</Badge></span>
            ) : (
              <p className="text-[13px] text-ink-muted">{isOpen ? 'Toko Buka' : 'Toko Tutup'}</p>
            )}
          </div>
        </div>
        {!activeOrder && (
          <div className="flex items-center gap-3 border-t border-line bg-sunken/50 py-1.5 pl-4 pr-2">
            <Badge tone={isOpen ? 'success' : 'neutral'} dot>{isOpen ? 'Buka' : 'Tutup'}</Badge>
            <span className="flex-1" />
            <Switch checked={isOpen} onChange={setIsOpen} label={isOpen ? 'Toko Buka' : 'Toko Tutup'} />
          </div>
        )}
      </Card>

      {suspended.length > 0 && (
        <Notice tone="danger" title={`${suspended.map((m) => m.name).join(', ')} dinonaktifkan oleh admin`}>
          Tidak tampil untuk pelanggan dan tidak bisa dipesan.
          {suspended[0].review_note ? ` Alasan: ${suspended[0].review_note}.` : ''} Hubungi tim Wira lewat Pusat Bantuan.
        </Notice>
      )}

      {kind === 'villa' && (
        <button
          type="button"
          onClick={() => navigate('/villa/listing')}
          className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-card p-3.5 text-left transition-colors hover:bg-sunken"
        >
          <IconTile tone="brand" size="sm"><Building2 size={18} /></IconTile>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-ink">Properti Saya</span>
            <span className="text-[12px] text-ink-muted">
              {merchants.length === 0 ? 'Belum ada properti' : `${liveCount} tayang dari ${merchants.length} properti`}
            </span>
          </span>
          <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
        </button>
      )}

      {!activeOrder ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3">
          <StatTile icon={ShoppingBag} tone="brand" value={todayOrders} label="Pesanan Hari Ini" />
          <StatTile
            icon={TrendingUp}
            tone="pay"
            value={<Money value={todayEarnings} sign={todayEarnings < 0 ? 'minus' : undefined} className="text-[20px] sm:text-[24px]" />}
            label="Pendapatan"
          />
        </div>
      ) : (
        <Card padding="none" className="overflow-hidden border-brand">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <IconTile tone="brand" size="md"><Store size={20} /></IconTile>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3 className="text-[15px] font-bold leading-snug text-ink text-balance">{isVillaOrder(activeOrder) ? 'Reservasi Terkonfirmasi' : 'Pesanan Harus Disiapkan'}</h3>
              <p className="text-xs text-ink-muted">Order ID: <span className="font-mono">{activeOrder.id.slice(0,8)}</span></p>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/60 p-3">
              <p className="text-[14px] font-semibold text-ink">{activeOrder.title || (isVillaOrder(activeOrder) ? 'Reservasi WiraVilla' : 'Pesanan WiraFood')}</p>
              {merchants.length > 1 && propertyName(activeOrder) && (
                <span><Badge tone="neutral">{propertyName(activeOrder)}</Badge></span>
              )}
              <OrderItems details={activeOrder.details} fallback="Tidak ada detail" />
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">Total Tagihan:</span>
              <Money value={activeOrder.total_price || 0} className="text-[20px] font-medium text-ink" />
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                leftIcon={<MessageCircle size={18} />}
                onClick={() => navigate('active-order/' + activeOrder.id)}
              >
                Chat
              </Button>
              <Button variant="primary" size="lg" className="flex-1" onClick={handleCompleteOrder}>
                {isVillaOrder(activeOrder) ? 'Tandai Selesai' : 'Tandai Siap / Selesai'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Incoming order prompt */}
      <Sheet
        open={isOpen && !!incomingOrder}
        onClose={noop}
        dismissible={false}
        size="sm"
        icon={<BellRing size={22} />}
        title={incomingOrder ? (incomingOrder.title || (isVillaOrder(incomingOrder) ? 'Reservasi WiraVilla' : 'Wira Food')) : ''}
        footer={incomingOrder && (
          <>
            <Button variant="secondary" size="lg" onClick={() => setIncomingOrder(null)}>Tolak</Button>
            <Button variant="primary" size="lg" onClick={handleAcceptOrder}>{isVillaOrder(incomingOrder) ? 'Konfirmasi Reservasi' : 'Terima Pesanan'}</Button>
          </>
        )}
      >
        {incomingOrder && (
          <div className="flex flex-col gap-4">
            {merchants.length > 1 && propertyName(incomingOrder) && (
              <span><Badge tone="brand">{propertyName(incomingOrder)}</Badge></span>
            )}
            <div className="rounded-control border border-line bg-card p-3.5">
              <OrderItems details={incomingOrder.details} fallback="Pesanan baru masuk!" />
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="text-sm font-semibold text-ink">Total Tagihan:</span>
              <Money value={incomingOrder.total_price || 0} className="text-[24px] font-medium leading-none text-ink" />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
export default MerchantHomePage;
