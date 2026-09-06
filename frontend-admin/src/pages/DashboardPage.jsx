import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardStats } from '../data/mockData';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Users, ShoppingBag, Wallet, Car, Clock, CheckCircle, XCircle, RefreshCw, ExternalLink, ShieldCheck 
} from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const COLORS = ['#0891B2', '#D97706', '#F97316', '#64748B'];

const StatCard = ({ title, value, icon: Icon, trend, subtext, highlight }) => (
  <div className={`card flex items-center gap-4 transition-all duration-200 ${
    highlight ? 'border-amber-400/50 bg-amber-50/20 dark:bg-amber-950/20 dark:border-amber-500/30' : ''
  }`}>
    <div className={`p-4 rounded-full ${
      highlight ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-primary/10 text-primary'
    }`}>
      <Icon size={24} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
      {trend && (
        <span className="text-xs font-medium text-green-500">+{trend}% bulan ini</span>
      )}
      {subtext && (
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 block truncate">{subtext}</span>
      )}
    </div>
  </div>
);

const DashboardPage = () => {
  const [mitraList, setMitraList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Ambil data registrasi mitra dari Supabase Cloud & Local Storage
  const fetchMitraData = async () => {
    setLoading(true);
    let all = [];

    // 1. Ambil dari Supabase Cloud feature_flags
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        all = [...data.features];
      }
    } catch (err) {
      console.warn('Gagal memuat pendaftaran dari cloud:', err);
    }

    // 2. Fallback Local Storage
    try {
      const local = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const existingIds = new Set(all.map((m) => m.id));
      for (const item of local) {
        if (!existingIds.has(item.id)) {
          all.push(item);
        }
      }
    } catch (e) {}

    setMitraList(all);
    setLoading(false);
  };

  useEffect(() => {
    fetchMitraData();

    // Real-time listener Supabase Cloud
    const channel = supabase
      .channel('realtime-dashboard-mitra')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            toast.success('Pendaftaran mitra baru terdeteksi!', { icon: '🔔' });
            fetchMitraData();
          }
        }
      )
      .subscribe();

    // BroadcastChannel jika dalam 1 browser
    let bc;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('wira_mitra_channel');
      bc.onmessage = (msg) => {
        if (msg.data && msg.data.type === 'NEW_MITRA') {
          toast.success(`Mitra baru mendaftar: ${msg.data.data.name}!`, { icon: '🛵' });
          fetchMitraData();
        }
      };
    }

    return () => {
      supabase.removeChannel(channel);
      if (bc) bc.close();
    };
  }, []);

  // Handle Verifikasi atau Tolak Mitra langsung dari Dashboard
  const handleVerify = async (id, accept) => {
    const newStatus = accept ? 'Active' : 'Inactive';
    
    // Update local state instan
    setMitraList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
    );

    // Update di Cloud Supabase feature_flags
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('id, features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      const currentList = Array.isArray(data?.features) ? data.features : [];
      const updated = currentList.map((m) =>
        m.id === id ? { ...m, status: newStatus } : m
      );

      if (data) {
        await supabase
          .from('feature_flags')
          .update({ features: updated, updated_at: new Date().toISOString() })
          .eq('region', 'mitra_registrations');
      } else {
        await supabase
          .from('feature_flags')
          .insert([{ region: 'mitra_registrations', features: updated, updated_at: new Date().toISOString() }]);
      }
    } catch (e) {
      console.warn('Update cloud error:', e);
    }

    // Update di localStorage
    try {
      const local = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = local.map((m) => (m.id === id ? { ...m, status: newStatus } : m));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {}

    // Update jika tabel mitra_registrations ada
    try {
      await supabase.from('mitra_registrations').update({ status: newStatus }).eq('id', id);
    } catch (e) {}

    toast.success(accept ? 'Mitra berhasil diverifikasi dan aktif!' : 'Pendaftaran mitra ditolak');
  };

  const pendingMitra = mitraList.filter((m) => m.status === 'Pending');
  const activeDriversCount = dashboardStats.activeDrivers + mitraList.filter((m) => m.role === 'driver' && m.status === 'Active').length;

  return (
    <div className="space-y-6">
      {/* Header Dashboard & Tombol Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pantau operasional dan verifikasi mitra Wira Lombok secara real-time</p>
        </div>
        <button
          onClick={fetchMitraData}
          className="inline-flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition shadow-sm w-fit"
          title="Segarkan Data Real-time"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : 'text-slate-500'} />
          <span>Segarkan Data</span>
        </button>
      </div>
      
      {/* Grid Statistik */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Pengguna" value={dashboardStats.totalUsers.toLocaleString('id-ID')} icon={Users} trend="12" />
        <StatCard title="Pesanan Hari Ini" value={dashboardStats.ordersToday} icon={ShoppingBag} trend="5" />
        <StatCard title="Pendapatan (Hari Ini)" value={`Rp ${dashboardStats.revenueToday.toLocaleString('id-ID')}`} icon={Wallet} trend="8" />
        <StatCard 
          title="Driver Aktif" 
          value={activeDriversCount} 
          icon={Car} 
          subtext={pendingMitra.filter(m => m.role === 'driver').length > 0 ? `${pendingMitra.filter(m => m.role === 'driver').length} pendaftar menunggu` : 'Operasional normal'}
        />
      </div>

      {/* ========================================================================= */}
      {/* 🚀 WIDGET PENDAFTARAN MITRA BARU (MENUNGGU VERIFIKASI)                      */}
      {/* Ditampilkan langsung di halaman Dashboard utama agar terlihat jelas      */}
      {/* ========================================================================= */}
      <div className="card border-2 border-amber-300 dark:border-amber-600/40 bg-gradient-to-br from-white via-amber-50/10 to-amber-100/20 dark:from-slate-800 dark:via-slate-800/90 dark:to-amber-950/20 p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-amber-200/60 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Pendaftaran Mitra Baru (Menunggu Verifikasi)
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  pendingMitra.length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}>
                  {pendingMitra.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Data pendaftar dari aplikasi Mitra yang memerlukan persetujuan admin sebelum dapat beroperasi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/drivers"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 bg-cyan-50 dark:bg-cyan-950/40 px-3 py-1.5 rounded-lg"
            >
              Lihat Semua Driver <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        {pendingMitra.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Tidak ada pendaftaran mitra yang menunggu verifikasi
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Semua calon driver, merchant, dan teknisi telah diverifikasi atau diproses. Data baru yang masuk dari aplikasi Mitra akan langsung muncul di sini secara otomatis.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 mt-2">
            {pendingMitra.map((mitra) => {
              const roleIcon = mitra.role === 'driver' ? '🛵' : mitra.role === 'merchant' ? '🍔' : '🔧';
              const roleTitle = mitra.role === 'driver' ? 'Driver Motor / Mobil' : mitra.role === 'merchant' ? 'Merchant Restoran' : 'Teknisi Jasa';
              const detailInfo = mitra.role === 'driver' 
                ? `${mitra.vehicle || 'Kendaraan'} • Plat: ${mitra.plate || '-'}`
                : mitra.role === 'merchant'
                ? `Restoran: ${mitra.restaurant_name || mitra.name} • ${mitra.address || 'Mataram'}`
                : `Spesialisasi: ${mitra.specialization || 'Jasa'} (${mitra.experience || 1} thn)`;

              return (
                <div key={mitra.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 rounded-xl px-2 transition">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl p-2 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center shrink-0">
                      {roleIcon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                          {mitra.name}
                        </span>
                        <span className="text-[11px] font-semibold bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full">
                          {roleTitle}
                        </span>
                        <span className="text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Menunggu Persetujuan
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{detailInfo}</span>
                        <span>•</span>
                        <a 
                          href={`https://wa.me/${mitra.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-green-600 dark:text-green-400 font-medium hover:underline flex items-center gap-1"
                        >
                          📱 WhatsApp: {mitra.phone}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Tombol Aksi Verifikasi Langsung */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => handleVerify(mitra.id, true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95"
                      title="Setujui pendaftaran mitra ini"
                    >
                      <CheckCircle size={15} /> Verifikasi Sekarang
                    </button>
                    <button
                      onClick={() => handleVerify(mitra.id, false)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 dark:bg-slate-700 dark:hover:bg-red-900/30 dark:text-slate-300 dark:hover:text-red-400 px-3 py-2 rounded-xl transition border border-slate-200 dark:border-slate-600"
                      title="Tolak pendaftaran mitra ini"
                    >
                      <XCircle size={15} /> Tolak
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grafik Pendapatan & Distribusi Layanan */}
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
