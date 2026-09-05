import { dashboardStats } from '../data/mockData';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, ShoppingBag, Wallet, Car } from 'lucide-react';

const COLORS = ['#0891B2', '#D97706', '#F97316', '#64748B'];

const StatCard = ({ title, value, icon: Icon, trend }) => (
  <div className="card flex items-center gap-4">
    <div className="p-4 rounded-full bg-primary/10 text-primary">
      <Icon size={24} />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className="text-xs font-medium text-green-500">+{trend}% bulan ini</span>
      )}
    </div>
  </div>
);

const DashboardPage = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h1>
      
      {/* Grid Statistik */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Pengguna" value={dashboardStats.totalUsers.toLocaleString('id-ID')} icon={Users} trend="12" />
        <StatCard title="Pesanan Hari Ini" value={dashboardStats.ordersToday} icon={ShoppingBag} trend="5" />
        <StatCard title="Pendapatan (Hari Ini)" value={`Rp ${dashboardStats.revenueToday.toLocaleString('id-ID')}`} icon={Wallet} trend="8" />
        <StatCard title="Driver Aktif" value={dashboardStats.activeDrivers} icon={Car} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grafik Pendapatan */}
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Grafik Pendapatan (7 Hari Terakhir)</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboardStats.revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <RechartsTooltip 
                  formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`}
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
                />
                <Line type="monotone" dataKey="total" stroke="#0891B2" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grafik Pesanan per Layanan */}
        <div className="card lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Distribusi Layanan</h2>
          <div className="h-80 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={dashboardStats.ordersByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {dashboardStats.ordersByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {dashboardStats.ordersByType.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  {entry.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
