import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Card, Badge, EmptyState, PageHeader, SectionHeader, Money, IconTile, Button } from '../../components/ui';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { User, Package, RefreshCw, History, Car, Utensils } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';
import { updateOrderStatus, driverEarnedAmount } from '../../services/orderService';
import { fetchCounterpartyProfiles } from '../../services/profileService';

// ---- Presentational helpers (Tenun Laut) ----

const SERVICE_ICON = { ride: Car, send: Package, food: Utensils };
const serviceIcon = (order) => SERVICE_ICON[order?.service_type] || (order?.merchant_id ? Utensils : Package);

// Order status -> Badge tone (DESIGN.md: pending = warning, active = brand,
// done = success, cancelled = danger).
const statusTone = (status) => {
  if (status === OrderStatus.COMPLETED) return 'success';
  if (status === OrderStatus.CANCELLED) return 'danger';
  if (status === OrderStatus.PENDING || status === OrderStatus.AWAITING_PAYMENT) return 'warning';
  return 'brand';
};

/** Per-order earning: can be negative for a Tunai order (commission owed). */
const EarnedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return n < 0
    ? <Money value={n} sign="minus" className={`text-danger-ink ${className}`} />
    : <Money value={n} tone="in" className={className} />;
};

const DriverOrdersPage = () => {
  const { user } = useAuth();
  // One unified Driver portal - shows every order ever assigned to this
  // driver regardless of service type, not scoped by any URL basePath
  // anymore (see DriverHomePage.jsx's identical rationale).
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerNames, setCustomerNames] = useState({});

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);

    // Customer names via the same RPC the home screen uses (a driver may
    // only read the profile of someone whose order they hold).
    const ids = (data || []).map((o) => o.user_id).filter(Boolean);
    if (ids.length) {
      fetchCounterpartyProfiles(supabase, ids)
        .then((profiles) => setCustomerNames(Object.fromEntries(Object.entries(profiles || {}).map(([id, p]) => [id, p?.name]))))
        .catch((err) => console.error('Customer names error:', err));
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const activeOrder = orders.find(o => o.status === OrderStatus.ACCEPTED || o.status === OrderStatus.PICKING_UP || o.status === OrderStatus.IN_TRIP);
  const history = orders.filter(o => o.status === OrderStatus.COMPLETED);

  const updateStatus = async (newStatus) => {
    if(activeOrder) {
      try {
        await updateOrderStatus(supabase, activeOrder.id, newStatus, user.id, 'driver');
        fetchOrders();
        toast.success(`Status diperbarui ke: ${getDisplayStatus(newStatus)}`);
      } catch (err) {
        toast.error('Gagal memperbarui status');
      }
    }
  };

  const ActiveIcon = activeOrder ? serviceIcon(activeOrder) : Package;

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader
        title="Pesanan"
        className="mb-0"
        actions={
          <Button variant="secondary" aria-label="Muat ulang" onClick={fetchOrders} className="w-11 px-0">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        }
      />

      {activeOrder ? (
        <Card padding="none" className="border-brand-line">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <IconTile tone="brand" size="sm"><ActiveIcon size={18} /></IconTile>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="text-[14px] font-semibold capitalize text-ink">{activeOrder.service_type}</span>
              <Badge tone={statusTone(activeOrder.status)} dot>{getDisplayStatus(activeOrder.status)}</Badge>
            </div>
            <Money value={activeOrder.total_price || 0} className="shrink-0 text-[18px] font-medium text-ink" />
          </div>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <IconTile tone="neutral" size="sm"><User size={18} /></IconTile>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">Pemesan: <span className="font-medium">{customerNames[activeOrder.user_id] || 'Pelanggan'}</span></p>
                <p className="text-xs text-ink-muted">Bayar via: <span className="capitalize">{activeOrder.payment_method}</span></p>
              </div>
            </div>

            <StatusUpdater currentStatus={activeOrder.status} role="driver" onUpdate={updateStatus} isFoodDelivery={!!activeOrder.merchant_id} />
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Package size={24} />} title="Belum ada pesanan aktif" description="Pesanan yang Anda terima akan muncul di sini." />
      )}

      <section>
        <SectionHeader title="Riwayat Selesai" />
        {history.length === 0 ? (
          <EmptyState icon={<History size={24} />} title="Belum ada riwayat" description="Pesanan yang sudah selesai akan tercatat di sini." />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {history.map(order => {
                const Icon = serviceIcon(order);
                return (
                  <li key={order.id} className="flex items-start gap-3 px-4 py-3.5">
                    <IconTile tone="neutral" size="sm"><Icon size={18} /></IconTile>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[14px] font-semibold leading-snug text-ink">
                        <span className="capitalize">{order.service_type}</span>
                        {customerNames[order.user_id] && <span className="font-normal text-ink-muted"> · {customerNames[order.user_id]}</span>}
                      </span>
                      <span className="font-mono text-[12px] text-ink-muted">{new Date(order.created_at).toLocaleDateString('id-ID')} {new Date(order.created_at).toLocaleTimeString('id-ID')}</span>
                      {order.payment_method === 'cash' && (
                        <span className="text-[11.5px] leading-snug text-ink-muted">Tunai: komisi dipotong dari saldo</span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <EarnedMoney value={driverEarnedAmount(order)} className="text-[14px] font-medium" />
                      <Badge tone={statusTone(order.status)} dot>{getDisplayStatus(order.status)}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
};
export default DriverOrdersPage;
