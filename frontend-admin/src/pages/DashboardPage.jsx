import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import {
  Users, Car, Store, TrendingUp, Activity, ShoppingBag, UserPlus, Wallet, Package, Home, Wrench, Inbox, ChevronRight,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import {
  Badge, Button, Card, EmptyState, IconTile, ListRow, Money, Notice, PageHeader, SectionHeader, Spinner, Stat, Table,
} from '../components/ui';
import { useTheme } from '../context/ThemeContext';
import { fetchPendingApplications } from '../services/mitraApplicationService';
import { orderStatusLabel } from '../config/orderStatus';

// Calendar day in the browser's timezone (WITA for the Lombok team), not UTC:
// toISOString() made each "day" run from 08:00 to 08:00 local time.
const SERVICE_LABELS = { ride: 'WiraRide', food: 'WiraFood', send: 'WiraSend', villa: 'WiraVilla', service: 'WiraService', pool: 'WiraPool', pulsa: 'WiraPulsa' };

const localDayKey = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Chart colours. Recharts needs raw values, so these mirror the Tenun Laut
// tokens (index.css) for each theme: line = hairline, muted = axis text.
const CHART_LIGHT = { grid: '#E4E1DA', axis: '#6B6862', money: '#A8791F', bars: ['#0B4F5E', '#3FA3B5'], card: '#FFFFFF', ink: '#21201D' };
const CHART_NIGHT = { grid: '#22363C', axis: '#9AA7AA', money: '#D9A845', bars: ['#16788C', '#3FA3B5'], card: '#142328', ink: '#ECEAE5' };

// Where each pending application is reviewed (same mapping as the header
// notifications in AdminLayout).
const ROLE_META = {
  driver: { title: 'Driver', link: '/drivers', icon: Car },
  courier: { title: 'Kurir', link: '/drivers', icon: Package },
  merchant: { title: 'Restoran', link: '/merchants', icon: Store },
  villa: { title: 'Villa', link: '/merchants', icon: Home },
  technician: { title: 'Teknisi', link: '/technicians', icon: Wrench },
};

const ORDER_STATUS_TONE = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'cancelled' || s === 'canceled' || s === 'rejected') return 'danger';
  if (s === 'pending' || s === 'searching') return 'warning';
  return 'brand';
};

// Platform commission on every completed order — 20%, mitras (merchant+driver
// combined, or driver alone for non-food services) keep the other 80%. This
// must match `credit_payout_on_order_completed()` in
// migrations/0028_mitra_payout_system.sql exactly, or this dashboard and the
// real payout ledger will disagree about how much Wira actually earns.
// For a food order (merchant_id set): platform keeps 20% of total_price
// (merchant gets 80% of total_price-delivery_fee, driver gets 80% of
// delivery_fee — together that's 80% of total_price either way).
// For a non-food order (merchant_id null): platform keeps 20% of
// total_price, driver keeps the other 80%.
// So the commission is a flat 20% of total_price for every completed order,
// regardless of service type.
const PLATFORM_COMMISSION_RATE = 0.20;

const DashboardPage = () => {
  const [stats, setStats] = useState({
    users: 0,
    drivers: 0,
    merchants: 0,
    transactions: 0,
    revenue: 0,
    gmv: 0,
    ordersToday: 0
  });
  
  const [chartData, setChartData] = useState([]);
  const [serviceData, setServiceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const palette = isDarkMode ? CHART_NIGHT : CHART_LIGHT;

  // Read-only extras for the dashboard widgets (recent orders, attention
  // list). Kept apart from fetchDashboard so a failure here never blanks
  // the key figures above.
  const [recentOrders, setRecentOrders] = useState([]);
  const [pendingApps, setPendingApps] = useState([]);
  const [staleCount, setStaleCount] = useState(0);

  useEffect(() => {
    const fetchExtras = async () => {
      try {
        const [recentRes, pendings] = await Promise.all([
          supabase.from('orders')
            .select('id, service_type, total_price, status, created_at, user:users!user_id(name), driver:users!driver_id(name)')
            .order('created_at', { ascending: false })
            .limit(8),
          fetchPendingApplications(null, 'id, role, name, phone, created_at'),
        ]);
        if (recentRes.error) throw recentRes.error;
        setRecentOrders(recentRes.data || []);
        setPendingApps(pendings || []);

        // Stuck active orders (migrations/0088); silently absent before it.
        const { data: stale } = await supabase.rpc('admin_stale_orders', { p_minutes: 60 });
        setStaleCount(Array.isArray(stale) ? stale.length : 0);
      } catch (err) {
        console.error('Dashboard extras error:', err);
      }
    };
    fetchExtras();
  }, []);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        // Aggregates come from the database (migrations/0087). Until that
        // migration is applied the RPC is missing (PGRST202) and the legacy
        // fetch-everything path below still runs.
        const { data: agg, error: aggError } = await supabase.rpc('admin_order_stats');
        if (!aggError && agg) {
          const [usersRes, merchantsRes] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user'),
            supabase.from('merchants').select('*', { count: 'exact', head: true }),
          ]);
          if (usersRes.error) throw usersRes.error;
          if (merchantsRes.error) throw merchantsRes.error;
          const gmv = Number(agg.gmv) || 0;
          setStats({
            users: usersRes.count || 0,
            drivers: Number(agg.drivers) || 0,
            merchants: merchantsRes.count || 0,
            transactions: Number(agg.completed_count) || 0,
            // Per-order rate from the database (villa 5%, others 20%; 0098).
            revenue: agg.commission != null ? Number(agg.commission) || 0 : gmv * PLATFORM_COMMISSION_RATE,
            gmv,
            ordersToday: Number(agg.orders_today) || 0,
          });
          setChartData((agg.daily || []).map((d) => ({
            name: new Date(`${d.day}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
            Pendapatan: d.commission != null ? Number(d.commission) || 0 : (Number(d.gmv) || 0) * PLATFORM_COMMISSION_RATE,
          })));
          setServiceData(
            Object.entries(agg.by_service || {})
              .map(([type, n]) => ({ name: SERVICE_LABELS[type] || type, Pesanan: Number(n) || 0 }))
              .sort((a, b) => b.Pesanan - a.Pesanan),
          );
          return;
        }
        if (aggError && aggError.code !== 'PGRST202') throw aggError;

        const [usersRes, allUsersRes, merchantsRes, ordersRes] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user'),
          supabase.from('users').select('*'),
          supabase.from('merchants').select('*', { count: 'exact', head: true }),
          supabase.from('orders').select('total_price, status, created_at, service_type')
        ]);

        if (usersRes.error) throw usersRes.error;
        if (allUsersRes.error) throw allUsersRes.error;
        if (merchantsRes.error) throw merchantsRes.error;
        if (ordersRes.error) throw ordersRes.error;

        const users = usersRes.count;
        const allUsers = allUsersRes.data;
        const merchants = merchantsRes.count;
        const allOrders = ordersRes.data || [];
        const completedOrders = allOrders.filter(o => o.status === 'completed');

        // Total Drivers
        const drivers = allUsers ? allUsers.filter(u => {
          if (!u.mitra_access) return false;
          if (Array.isArray(u.mitra_access)) return u.mitra_access.includes('driver');
          if (typeof u.mitra_access === 'string') return u.mitra_access.includes('driver');
          return false;
        }).length : 0;

        // GMV = raw gross transaction value (what customers paid). Real
        // platform income is only the 20% commission — see
        // PLATFORM_COMMISSION_RATE above — summing raw total_price and
        // calling it "Pendapatan" overstates actual platform revenue ~5x.
        const totalGMV = completedOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
        const totalRev = totalGMV * PLATFORM_COMMISSION_RATE;

        setStats({
          users: users || 0,
          drivers: drivers || 0,
          merchants: merchants || 0,
          transactions: completedOrders.length,
          revenue: totalRev,
          gmv: totalGMV,
          ordersToday: allOrders.filter(o => o.created_at && localDayKey(o.created_at) === localDayKey(new Date())).length
        });

        // Generate Chart Data (Last 7 Days)
        const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return localDayKey(d);
        });

        const dailyRevenue = last7Days.map(date => {
          const dayOrders = completedOrders.filter(o => o.created_at && localDayKey(o.created_at) === date);
          const dayGMV = dayOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
          return {
            name: new Date(date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
            Pendapatan: dayGMV * PLATFORM_COMMISSION_RATE
          };
        });
        setChartData(dailyRevenue);

        // Service Type Data
        const rideCount = allOrders.filter(o => o.service_type === 'ride').length;
        const foodCount = allOrders.filter(o => o.service_type === 'food').length;
        
        setServiceData([
          { name: 'WiraRide', Pesanan: rideCount },
          { name: 'WiraFood', Pesanan: foodCount }
        ]);

      } catch (err) {
        console.error("Dashboard error:", err);
        toast.error("Gagal memuat data dasbor.");
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const header = (
    <PageHeader
      eyebrow={today}
      title="Dasbor Wira"
      subtitle="Ringkasan aktivitas seluruh ekosistem Wira di Pulau Lombok"
      actions={<Badge tone="success" dot>Live</Badge>}
      className="!mb-0"
    />
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="flex items-center justify-center gap-3 py-16 text-[13.5px] text-ink-muted">
          <Spinner size={18} className="text-brand" /> Memuat Dasbor Wira...
        </Card>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: palette.card,
    border: `1px solid ${palette.grid}`,
    borderRadius: 12,
    boxShadow: '0 16px 40px -12px rgba(6, 47, 60, 0.28)',
    fontSize: 12.5,
    color: palette.ink,
  };
  const axisTick = { fontSize: 12, fill: palette.axis };
  // Big money figures sit a step smaller than counts so long rupiah fits the tile.
  const moneyValue = (n) => <Money value={n} className="text-[22px]" />;

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* Key figures */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Pesanan Hari Ini" value={stats.ordersToday.toLocaleString('id-ID')} icon={<ShoppingBag size={18} />} hint="Semua status layanan" />
        <Stat label="Volume Transaksi (GMV)" value={moneyValue(stats.gmv)} icon={<TrendingUp size={18} />} tone="pay" hint="Kotor, dari pesanan selesai" />
        <Stat label="Pendapatan Platform" value={moneyValue(stats.revenue)} icon={<Wallet size={18} />} tone="pay" hint="Komisi per layanan (menu Komisi)" />
        <Stat label="Menunggu Verifikasi" value={pendingApps.length.toLocaleString('id-ID')} icon={<UserPlus size={18} />} tone={pendingApps.length > 0 ? 'brand' : 'neutral'} hint="Pendaftaran mitra baru" />
        <Stat label="Total Pengguna" value={stats.users.toLocaleString('id-ID')} icon={<Users size={18} />} tone="neutral" hint="Aktif" />
        <Stat label="Total Driver" value={stats.drivers.toLocaleString('id-ID')} icon={<Car size={18} />} tone="neutral" hint="Aktif" />
        <Stat label="Total Merchant" value={stats.merchants.toLocaleString('id-ID')} icon={<Store size={18} />} tone="neutral" hint="Aktif" />
        <Stat label="Transaksi Berhasil" value={stats.transactions.toLocaleString('id-ID')} icon={<Activity size={18} />} tone="success" hint="Selesai" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Revenue Line Chart */}
        <Card padding="lg" className="min-w-0 xl:col-span-2">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Pendapatan Platform (Komisi 20%)</h2>
              <Money value={stats.revenue} tone="pay" className="text-[26px] font-medium leading-tight tracking-tight" />
              <p className="text-xs text-ink-muted">
                dari <Money value={stats.gmv} className="text-ink" /> volume transaksi (GMV)
              </p>
            </div>
            <Badge tone="neutral">7 hari terakhir</Badge>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={palette.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={6} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ ...axisTick, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000).toLocaleString('id-ID')}rb` : String(Math.round(v)))}
                  width={56}
                />
                <RechartsTooltip
                  formatter={(value) => ['Rp ' + Math.round(value).toLocaleString('id-ID'), 'Komisi Platform']}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: palette.axis, marginBottom: 2 }}
                  itemStyle={{ color: palette.ink, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                  cursor={{ stroke: palette.grid, strokeWidth: 1 }}
                />
                <Line type="monotone" dataKey="Pendapatan" stroke={palette.money} strokeWidth={2.5} dot={{ r: 3.5, fill: palette.money, strokeWidth: 2, stroke: palette.card }} activeDot={{ r: 5.5, stroke: palette.card, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Orders by Service */}
        <Card padding="lg" className="min-w-0">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-bold tracking-tight text-ink">Sebaran Layanan</h2>
              <p className="text-xs text-ink-muted">Jumlah pesanan per layanan</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={palette.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ ...axisTick, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }} allowDecimals={false} width={40} />
                <RechartsTooltip
                  cursor={{ fill: palette.grid, fillOpacity: 0.35 }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: palette.axis, marginBottom: 2 }}
                  itemStyle={{ color: palette.ink, fontFamily: '"IBM Plex Mono", ui-monospace, monospace' }}
                />
                <Bar dataKey="Pesanan" radius={[6, 6, 0, 0]} barSize={40}>
                  {serviceData.map((entry, i) => (
                    <Cell key={entry.name} fill={palette.bars[i % palette.bars.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Recent orders + attention */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="flex min-w-0 flex-col xl:col-span-2">
          <SectionHeader
            title="Pesanan Terbaru"
            action={(
              <button type="button" onClick={() => navigate('/orders')} className="inline-flex items-center gap-0.5 hover:underline">
                Lihat semua <ChevronRight size={15} />
              </button>
            )}
          />
          {recentOrders.length === 0 ? (
            <EmptyState icon={<ShoppingBag size={22} />} title="Belum ada pesanan." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>ID Pesanan</th>
                  <th>Layanan</th>
                  <th>Pelanggan</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-[12.5px] text-ink">{o.id.slice(0, 8)}</span>
                      <span className="block font-mono text-[11.5px] text-ink-muted">
                        {o.created_at ? new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{o.service_type}</td>
                    <td className="max-w-[220px]">
                      <span className="block truncate font-semibold">{o.user?.name || 'Anonim'}</span>
                      <span className="block truncate text-xs text-ink-muted">{o.driver?.name || '-'}</span>
                    </td>
                    <td className="text-right"><Money value={o.total_price || 0} /></td>
                    <td><Badge tone={ORDER_STATUS_TONE(o.status)} dot>{orderStatusLabel(o.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionHeader
            title="Perlu Tindakan"
            action={pendingApps.length + staleCount > 0 ? <Badge tone="warning" className="font-mono">{pendingApps.length + staleCount}</Badge> : null}
          />
          {staleCount > 0 && (
            <Notice
              tone="warning"
              title={`${staleCount} pesanan macet`}
              className="mb-3"
              action={<Button size="sm" variant="secondary" onClick={() => navigate('/orders')}>Tinjau</Button>}
            >
              Statusnya tidak bergerak lebih dari 60 menit.
            </Notice>
          )}
          {pendingApps.length === 0 && staleCount > 0 ? null : pendingApps.length === 0 ? (
            <EmptyState icon={<Inbox size={22} />} title="Tidak ada notifikasi riil baru" description="Pendaftaran mitra yang menunggu verifikasi akan muncul di sini." />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-line">
                {pendingApps.slice(0, 6).map((m) => {
                  const meta = ROLE_META[m.role] || { title: m.role || 'Mitra', link: '/users', icon: UserPlus };
                  const RoleIcon = meta.icon;
                  return (
                    <li key={m.id}>
                      <ListRow
                        className="px-4 py-3"
                        leading={<IconTile tone="brand" size="sm"><RoleIcon size={17} /></IconTile>}
                        title={m.name}
                        subtitle={(
                          <>
                            {`Pendaftaran ${meta.title} Baru`}
                            {m.phone && <> · <span className="font-mono">{m.phone}</span></>}
                          </>
                        )}
                        trailing={(
                          <Button size="sm" variant="secondary" onClick={() => navigate(meta.link)}>
                            Tinjau
                          </Button>
                        )}
                      />
                    </li>
                  );
                })}
              </ul>
              {pendingApps.length > 6 && (
                <p className="border-t border-line bg-sunken/50 px-4 py-2.5 text-center text-xs text-ink-muted">
                  +<span className="font-mono">{pendingApps.length - 6}</span> pendaftaran lainnya menunggu verifikasi
                </p>
              )}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
