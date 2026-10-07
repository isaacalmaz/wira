import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, Button, EmptyState, PageHeader, Segmented, Notice, Money, Spinner, Select } from '../../components/ui';
import { Clock, RefreshCw, MessageCircle, ClipboardList, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { OrderStatus } from '../../constants/orderStatus';
import { updateOrderStatus, orderErrorMessage } from '../../services/orderService';
import { parseOrderDetails } from '../../utils/formatters';
import ChatModal from '../../components/common/ChatModal';
import API_BASE_URL from '../../config/api';
import useMyMerchants from '../../hooks/useMyMerchants';

// Status badge tone (DESIGN.md §5): waiting = warning, in progress = brand,
// done = success, cancelled = danger. Display only.
const statusTone = (status) => {
  if (status === OrderStatus.PENDING || status === OrderStatus.AWAITING_PAYMENT) return 'warning';
  if (status === OrderStatus.COMPLETED) return 'success';
  if (status === OrderStatus.CANCELLED) return 'danger';
  return 'brand';
};
// The raw status value, as before, just without the underscore.
const statusLabel = (status) => String(status || '').replace(/_/g, ' ');

// Display-only: food orders store their items as a JSON array in `details`;
// list them one per line with the quantity in mono. Anything else falls back
// to the existing parseOrderDetails string.
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
        <li key={i} className="flex items-baseline gap-2.5 text-[13.5px] text-ink">
          <span className="w-8 shrink-0 font-mono font-medium text-ink-muted">{item.quantity || 1}×</span>
          <span className="min-w-0 flex-1 break-words">{item.name || 'Item'}</span>
        </li>
      ))}
    </ul>
  );
};

const MerchantOrdersPage = () => {
  const { user } = useAuth();
  // All of this owner's properties on this portal (migration 0097).
  const { merchants, ids: merchantIds, loading: merchantsLoading } = useMyMerchants();
  const idsKey = merchantIds.join(',');
  const [property, setProperty] = useState('all');
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [chatOrder, setChatOrder] = useState(null); // {id, customerName} | null
  const [names, setNames] = useState({}); // user_id -> customer name
  const [pins, setPins] = useState({}); // order_id -> handover PIN (food, ready/picking_up)

  const openChat = async (order) => {
    let customerName = 'Pelanggan';
    if (order.user_id) {
      const profiles = await fetchCounterpartyProfiles(supabase, [order.user_id]);
      if (profiles[order.user_id]?.name) customerName = profiles[order.user_id].name;
    }
    setChatOrder({ id: order.id, customerName });
  };

  const fetchOrders = async () => {
    if (!user || merchantsLoading) return;
    setLoading(true);

    if (!idsKey) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('merchant_id', idsKey.split(','))
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);

    const rows = data || [];
    const userIds = [...new Set(rows.map((o) => o.user_id).filter(Boolean))];
    if (userIds.length) {
      const profiles = await fetchCounterpartyProfiles(supabase, userIds);
      setNames(Object.fromEntries(Object.entries(profiles).map(([id, p]) => [id, p?.name]).filter(([, n]) => n)));
    }
    // The courier must enter this PIN to start the delivery (migrations/0113).
    const handover = rows.filter((o) => [OrderStatus.READY, OrderStatus.PICKING_UP].includes(o.status)).map((o) => o.id);
    if (handover.length) {
      const { data: pinRows } = await supabase.from('order_security_pins').select('order_id, pin').in('order_id', handover);
      setPins(Object.fromEntries((pinRows || []).map((r) => [r.order_id, r.pin])));
    }
  };

  useEffect(() => {
    fetchOrders();
  // Re-fetch when these inputs change; the fetch function is recreated each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idsKey, merchantsLoading]);

  // Fires the real push-notification pipeline (backend's POST
  // /api/notifications/order-alert, see notification.routes.js) the moment
  // this merchant marks a food order 'ready' - the customer is the one
  // single, always-known target at this point (the driver who'll pick it up
  // isn't assigned yet). Best-effort: a failure here (no fcm_token saved yet,
  // no VAPID key configured client-side, network hiccup) must never block or
  // roll back the actual order-status update above it.
  const notifyOrderReady = async (order) => {
    if (!order?.user_id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`${API_BASE_URL}/notifications/order-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: order.user_id,
          title: 'Pesanan Anda Siap!',
          body: 'Pesanan WiraFood Anda sudah siap dan sedang menunggu kurir untuk diantar.',
          data: { orderId: order.id, type: 'order_ready' },
        }),
      });
    } catch (err) {
      console.error('notifyOrderReady failed:', err);
    }
  };

  const updateStatus = async (order, newStatus) => {
    try {
      await updateOrderStatus(supabase, order.id, newStatus, order.merchant_id, 'merchant');
      toast.success('Status pesanan diperbarui');
      if (newStatus === OrderStatus.READY) {
        notifyOrderReady(order);
      }
      fetchOrders();
    } catch (err) {
      toast.error(orderErrorMessage(err, err.message || 'Gagal memperbarui status pesanan'));
    }
  };

  const propertyName = (id) => merchants.find((m) => m.id === id)?.name;
  const filteredOrders = orders.filter(o => property === 'all' || o.merchant_id === property).filter(o => tab === 'active' ? (o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED) : (o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED));

  return (
    <div className="flex flex-col gap-5 pb-20">
      <PageHeader
        title="Daftar Pesanan"
        className="mb-0"
        actions={
          <Button variant="secondary" onClick={fetchOrders} aria-label="Muat ulang" title="Muat ulang" className="w-11 px-0">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        }
      />

      {merchants.length > 1 && (
        <Select id="orders-property" aria-label="Pilih properti" value={property} onChange={(e) => setProperty(e.target.value)}>
          <option value="all">Semua properti ({merchants.length})</option>
          {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      )}

      <Segmented
        ariaLabel="Daftar Pesanan"
        className="w-full"
        options={[{ value: 'active', label: 'Aktif' }, { value: 'history', label: 'Riwayat' }]}
        value={tab}
        onChange={setTab}
      />

      <div className="flex flex-col gap-3">
        {loading && orders.length === 0 ? (
          <div className="flex justify-center py-12 text-brand-ink" role="status">
            <Spinner size={24} />
          </div>
        ) : filteredOrders.length > 0 ? filteredOrders.map(order => {
          const isVilla = order.service_type === 'villa' || order.service_type === 'WiraVilla';
          return (
          <Card key={order.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span><Badge tone={statusTone(order.status)} dot className="capitalize">{statusLabel(order.status)}</Badge></span>
                <h3 className="font-mono text-[13px] font-medium text-ink">{order.id.slice(0,12)}</h3>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-muted">
                  <Clock size={12} aria-hidden="true" />
                  <span className="font-mono">{new Date(order.created_at).toLocaleTimeString('id-ID')}</span>
                  <span aria-hidden="true">•</span>
                  <span>{names[order.user_id] || 'Pelanggan'}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {/* Food: the restaurant receives the menu price, not the courier's delivery fee. */}
                <Money
                  value={isVilla ? (order.total_price || 0) : Math.max(Number(order.total_price || 0) - Number(order.delivery_fee || 0), 0) + Number(order.promo_discount || 0)}
                  className="text-[16px] font-medium text-ink"
                />
                {!isVilla && <span className="text-[11px] text-ink-muted">harga menu{order.payment_method === 'cash' ? ' · tunai dari kurir' : ''}</span>}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/60 p-3">
              <p className="text-[14px] font-semibold text-ink">{order.title || (isVilla ? 'Reservasi WiraVilla' : 'Pesanan WiraFood')}</p>
              {isVilla && order.check_in && (
                <p className="font-mono text-[12.5px] text-ink">
                  Check-in {new Date(`${order.check_in}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  {' → '}{new Date(`${order.check_out}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{order.nights} malam
                </p>
              )}
              {merchants.length > 1 && property === 'all' && propertyName(order.merchant_id) && (
                <span><Badge tone="neutral">{propertyName(order.merchant_id)}</Badge></span>
              )}
              <OrderItems details={order.details} fallback={isVilla ? 'Tidak ada detail reservasi' : 'Tidak ada detail menu'} />
            </div>

            {tab === 'active' && (
              <div className="flex items-stretch gap-2">
                {order.status === OrderStatus.PENDING ? (
                  <>
                    {/* Only cash orders: nothing to refund (WiraPay refunds go through an admin). */}
                    {order.payment_method === 'cash' && (
                      <Button variant="danger-soft" onClick={() => { if (window.confirm('Tolak pesanan ini? Pelanggan akan diberi tahu.')) updateStatus(order, OrderStatus.CANCELLED); }}>
                        Tolak
                      </Button>
                    )}
                    <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.ACCEPTED)}>{isVilla ? 'Konfirmasi Reservasi' : 'Terima'}</Button>
                  </>
                ) : (
                  <>
                    {isVilla ? (
                      order.status === OrderStatus.ACCEPTED && (
                        <Button variant="primary" className="flex-1" leftIcon={<CheckCircle2 size={16} />} onClick={() => updateStatus(order, OrderStatus.COMPLETED)}>Tandai Selesai</Button>
                      )
                    ) : order.status === OrderStatus.ACCEPTED ? (
                      <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.PREPARING)}>Mulai Siapkan</Button>
                    ) : order.status === OrderStatus.PREPARING ? (
                      <Button variant="primary" className="flex-1" onClick={() => updateStatus(order, OrderStatus.READY)}>Siap Diambil</Button>
                    ) : order.status === OrderStatus.READY ? (
                      <Notice tone="warning" className="flex-1 items-center py-2.5">
                        {pins[order.id]
                          ? <>Berikan PIN <span className="font-mono text-[15px] font-semibold tracking-[0.2em]">{pins[order.id]}</span> ke kurir saat menyerahkan pesanan.</>
                          : 'Menunggu kurir mengambil pesanan...'}
                      </Notice>
                    ) : order.status === OrderStatus.PICKING_UP || order.status === OrderStatus.IN_TRIP ? (
                      <Notice tone="info" className="flex-1 items-center py-2.5">
                        Kurir sedang mengantar
                      </Notice>
                    ) : null}
                    <Button variant="secondary" leftIcon={<MessageCircle size={16} />} onClick={() => openChat(order)}>
                      Chat
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
          );
        }) : (
          <EmptyState icon={<ClipboardList size={24} />} title="Tidak ada pesanan" description={tab === 'active' ? 'Pesanan baru akan muncul di sini.' : 'Belum ada riwayat pesanan.'} />
        )}
      </div>

      {chatOrder && (
        <ChatModal
          orderId={chatOrder.id}
          onClose={() => setChatOrder(null)}
          receiverName={chatOrder.customerName}
        />
      )}
    </div>
  );
};
export default MerchantOrdersPage;
