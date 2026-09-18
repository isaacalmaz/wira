import re

content = """import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { Users, Car, Store, ArrowUpRight, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const DashboardPage = () => {
  const [stats, setStats] = useState({
    users: 0,
    drivers: 0,
    merchants: 0,
    transactions: 0,
    revenue: 0
  });
  
  const [chartData, setChartData] = useState([]);
  const [serviceData, setServiceData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const [usersRes, allUsersRes, merchantsRes, ordersRes] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user'),
          supabase.from('users').select('*'),
          supabase.from('merchants').select('*', { count: 'exact', head: true }),
          supabase.from('orders').select('total_price, status, created_at, type')
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

        const totalRev = completedOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
        
        setStats({
          users: users || 0,
          drivers: drivers || 0,
          merchants: merchants || 0,
          transactions: completedOrders.length,
          revenue: totalRev
        });

        // Generate Chart Data (Last 7 Days)
        const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
        });

        const dailyRevenue = last7Days.map(date => {
          const dayOrders = completedOrders.filter(o => o.created_at && o.created_at.startsWith(date));
          const rev = dayOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
          return {
            name: new Date(date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
            Pendapatan: rev
          };
        });
        setChartData(dailyRevenue);

        // Service Type Data
        const rideCount = allOrders.filter(o => o.type === 'ride').length;
        const foodCount = allOrders.filter(o => o.type === 'food').length;
        
        setServiceData([
          { name: 'WiraRide', Pesanan: rideCount, fill: '#3b82f6' },
          { name: 'WiraFood', Pesanan: foodCount, fill: '#f59e0b' }
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

  if (loading) return <div className="p-10 text-center animate-pulse">Memuat Dasbor Wira...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dasbor Wira (Live)</h1>
          <p className="text-sm text-slate-500">Ringkasan aktivitas seluruh ekosistem Wira di Pulau Lombok</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Pengguna" value={stats.users} icon={<Users size={20} />} trend="Aktif" color="blue" />
        <StatCard title="Total Driver" value={stats.drivers} icon={<Car size={20} />} trend="Aktif" color="indigo" />
        <StatCard title="Total Merchant" value={stats.merchants} icon={<Store size={20} />} trend="Aktif" color="amber" />
        <StatCard title="Transaksi Berhasil" value={stats.transactions} icon={<Activity size={20} />} trend="Selesai" color="emerald" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Revenue Line Chart */}
        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold">Total Pendapatan (7 Hari Terakhir)</h2>
              <p className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">Rp {stats.revenue.toLocaleString('id-ID')}</p>
            </div>
            <div className="p-2 bg-green-100 text-green-700 rounded-lg"><DollarSign size={20}/></div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(val) => \`Rp ${val/1000}k\`}
                />
                <RechartsTooltip 
                  formatter={(value) => ['Rp ' + value.toLocaleString('id-ID'), 'Pendapatan']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="Pendapatan" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: 'white' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders by Service */}
        <div className="card">
          <h2 className="text-lg font-bold mb-6">Sebaran Layanan</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <RechartsTooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="Pesanan" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color }) => {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    amber: 'bg-amber-100 text-amber-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <div className="card hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorMap[color]}`}>
          {icon}
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
          <ArrowUpRight size={14} /> {trend.split(' ')[0]}
        </span>
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
        <h4 className="text-2xl font-bold text-slate-800 dark:text-white">{value.toLocaleString('id-ID')}</h4>
      </div>
    </div>
  );
};

export default DashboardPage;
"""

with open('frontend-admin/src/pages/DashboardPage.jsx', 'w') as f:
    f.write(content)

