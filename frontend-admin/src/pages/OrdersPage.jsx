import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { ShoppingBag, Search } from 'lucide-react';
import { Badge, Card, EmptyState, Input, Money, PageHeader, Select, Spinner, Table } from '../components/ui';
import { orderStatusLabel } from '../config/orderStatus';
import StaleOrdersPanel from '../components/common/StaleOrdersPanel';
import OrderDetailSheet from '../components/common/OrderDetailSheet';

const SERVICE_LABEL = { ride: 'WiraRide', send: 'WiraSend', food: 'WiraFood', villa: 'WiraVilla', service: 'WiraService', pool: 'WiraPool', pulsa: 'WiraPulsa' };

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  // ?id=<order> opens that order (links from the dashboard and alerts).
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const openOrder = (id) => setParams(id ? { id } : {}, { replace: !id });
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    // Kita ambil juga data user dan driver agar tau nama pelakunya
    const { data, error } = await supabase.from('orders')
      .select('*, user:users!user_id(name), driver:users!driver_id(name)')
      .order('created_at', { ascending: false })
      .limit(1000);

    // A failed load must not look like "no orders".
    setLoadError(Boolean(error));
    if (data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  // Status options are built from whatever actually shows up in the data
  // (orders.status has no fixed enum across the state machine - pending/
  // completed/cancelled plus mitra-app-specific in-progress states) rather
  // than a hardcoded list that could silently omit a real status.
  const statusOptions = useMemo(
    () => Array.from(new Set(orders.map(o => o.status).filter(Boolean))).sort(),
    [orders]
  );

  // This page used to fetch every order with no search or filter at all -
  // with any real order volume, ops had no way to find a specific order.
  // Matches by order id (full UUID or the truncated form shown in the
  // table), customer name, or driver/mitra name.
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (serviceFilter !== 'all' && o.service_type !== serviceFilter) return false;
      if (!term) return true;
      return (
        o.id?.toLowerCase().includes(term) ||
        o.user?.name?.toLowerCase().includes(term) ||
        o.driver?.name?.toLowerCase().includes(term)
      );
    });
  }, [orders, search, statusFilter, serviceFilter]);

  const serviceOptions = useMemo(
    () => Array.from(new Set(orders.map(o => o.service_type).filter(Boolean))).sort(),
    [orders]
  );

  const statusTone = (status) => {
    const st = String(status || '').toLowerCase();
    if (st === 'completed') return 'success';
    if (st === 'pending') return 'warning';
    if (st === 'cancelled' || st === 'canceled') return 'danger';
    return 'brand';
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pesanan"
        subtitle="Seluruh pesanan Wira. Klik pesanan untuk melihat detail, riwayat, chat dan tindakan."
        className="!mb-0"
      />

      <StaleOrdersPanel onOpen={openOrder} refreshKey={refreshKey} />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            type="text"
            aria-label="Cari pesanan"
            placeholder="Cari ID pesanan / nama pelanggan / driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 !text-sm"
          />
        </div>
        <Select
          aria-label="Filter status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="!text-sm md:w-56"
        >
          <option value="all">Semua Status</option>
          {statusOptions.map(s => (
            <option key={s} value={s}>{orderStatusLabel(s)}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter layanan"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="!text-sm md:w-44"
        >
          <option value="all">Semua Layanan</option>
          {serviceOptions.map(s => (
            <option key={s} value={s}>{SERVICE_LABEL[s] || s}</option>
          ))}
        </Select>
        {!loading && (
          <p className="text-[13px] text-ink-muted md:ml-auto">
            <span className="font-mono font-medium text-ink">{filteredOrders.length.toLocaleString('id-ID')}</span> pesanan
          </p>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-3 py-16 text-[13.5px] text-ink-muted">
          <Spinner size={18} className="text-brand" /> Memuat...
        </Card>
      ) : loadError && orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center text-[13.5px] text-ink-muted">
          Pesanan belum bisa dimuat. Periksa koneksi, lalu coba lagi.
          <button type="button" onClick={fetchOrders} className="min-h-11 rounded-control border border-line-strong px-4 font-semibold text-ink hover:bg-sunken">Coba lagi</button>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={22} />}
          title={orders.length === 0 ? 'Belum ada pesanan.' : 'Tidak ada pesanan yang cocok dengan pencarian/filter.'}
        />
      ) : (
        <Table titleCol={2}>
          <thead>
            <tr>
              <th>ID Pesanan</th>
              <th>Layanan</th>
              <th>Pelanggan</th>
              <th>Driver/Mitra</th>
              <th className="text-right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(o => (
              <tr
                key={o.id}
                onClick={() => openOrder(o.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') openOrder(o.id); }}
                tabIndex={0}
                className="cursor-pointer hover:bg-sunken/60 focus-visible:bg-sunken/60 focus-visible:outline-none"
              >
                <td className="whitespace-nowrap font-mono text-[12.5px]">
                  {o.id.slice(0,8)}
                  <span className="block text-[11.5px] text-ink-muted">{new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{SERVICE_LABEL[o.service_type] || o.service_type}</td>
                <td className="font-semibold">{o.user?.name || 'Anonim'}</td>
                <td className={o.driver?.name ? '' : 'text-ink-muted'}>{o.driver?.name || '-'}</td>
                <td className="text-right"><Money value={o.total_price || 0} /></td>
                <td><Badge tone={statusTone(o.status)} dot>{orderStatusLabel(o.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <OrderDetailSheet
        orderId={openId}
        onClose={() => openOrder(null)}
        onChanged={() => { fetchOrders(); setRefreshKey((k) => k + 1); }}
      />
    </div>
  );
};
export default OrdersPage;
