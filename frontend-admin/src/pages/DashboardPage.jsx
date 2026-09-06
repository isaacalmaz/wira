import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Users, Car, Store, ArrowUpRight, TrendingUp, DollarSign, Activity } from 'lucide-react';

const DashboardPage = () => {
  const [stats, setStats] = useState({
    users: 0,
    drivers: 0,
    merchants: 0,
    transactions: 0,
    revenue: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const [{ count: users }, { count: drivers }, { count: merchants }, { data: orders }] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user'),
          supabase.from('users').select('*', { count: 'exact', head: true }).contains('mitra_access', '["driver"]'),
          supabase.from('merchants').select('*', { count: 'exact', head: true }),
          supabase.from('orders').select('total_price, status').eq('status', 'completed')
        ]);

        const totalRev = orders ? orders.reduce((sum, o) => sum + (o.total_price || 0), 0) : 0;
        
        setStats({
          users: users || 0,
          drivers: drivers || 0,
          merchants: merchants || 0,
          transactions: orders?.length || 0,
          revenue: totalRev
        });
      } catch (err) {
        console.error(err);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Pengguna" value={stats.users} icon={<Users size={20} />} trend="+12% bulan ini" color="blue" />
        <StatCard title="Total Driver" value={stats.drivers} icon={<Car size={20} />} trend="+5% bulan ini" color="indigo" />
        <StatCard title="Total Merchant" value={stats.merchants} icon={<Store size={20} />} trend="+18% bulan ini" color="amber" />
        <StatCard title="Transaksi Berhasil" value={stats.transactions} icon={<Activity size={20} />} trend="+24% bulan ini" color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold">Total Pendapatan Ekosistem</h2>
            <div className="p-2 bg-green-100 text-green-700 rounded-lg"><DollarSign size={20}/></div>
          </div>
          <p className="text-4xl font-extrabold text-slate-800 dark:text-white mb-2">Rp {stats.revenue.toLocaleString('id-ID')}</p>
          <p className="text-sm text-slate-500 flex items-center gap-1"><TrendingUp size={14} className="text-green-500"/> Terus meningkat bulan ini</p>
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
