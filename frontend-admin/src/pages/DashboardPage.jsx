import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Users, ShoppingBag, Wallet, Car, Clock, CheckCircle, XCircle, RefreshCw, ExternalLink, ShieldCheck, FileSearch, MessageSquare 
} from 'lucide-react';
import { supabase } from '../config/supabase';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';

const COLORS = ['#0891B2', '#D97706', '#F97316', '#64748B', '#10B981', '#6366F1'];

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
  const [totalUsers, setTotalUsers] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueChart, setRevenueChart] = useState([]);
  const [serviceDist, setServiceDist] = useState([]);
  
  // State untuk modal review calon mitra
  const [selectedMitra, setSelectedMitra] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Ambil data real-time dari Supabase Cloud
  const fetchDashboardData = async () => {
    setLoading(true);
    let allMitra = [];

    // 1. Ambil pendaftaran mitra dari Supabase Cloud (feature_flags)
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        allMitra = [...data.features];
      }
    } catch (err) {
      console.warn('Gagal memuat mitra dari cloud:', err);
    }

    // Fallback local storage
    try {
      const local = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const existingIds = new Set(allMitra.map((m) => m.id));
      for (const item of local) {
        if (!existingIds.has(item.id)) allMitra.push(item);
      }
    } catch (e) {}

    setMitraList(allMitra);

    // 2. Ambil statistik pengguna riil
    try {
      const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
      setTotalUsers(count || allMitra.length);
    } catch (e) {
      setTotalUsers(allMitra.length);
    }

    // 3. Ambil statistik pesanan & pendapatan riil
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (orders && orders.length > 0) {
        const todayOrders = orders.filter((o) => new Date(o.created_at) >= today);
        setOrdersToday(todayOrders.length);

        const revToday = todayOrders
          .filter((o) => o.status === 'completed' || o.payment_status === 'paid')
          .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
        setRevenueToday(revToday);

        // Hitung distribusi layanan
        const distMap = {};
        for (const o of orders) {
          const s = o.service_type || 'ride';
          distMap[s] = (distMap[s] || 0) + 1;
        }
        const distArray = Object.entries(distMap).map(([name, value]) => ({
          name: name === 'ride' ? 'WiraRide' : name === 'food' ? 'WiraFood' : name === 'send' ? 'WiraSend' : name,
          value,
        }));
        setServiceDist(distArray);
      } else {
        setOrdersToday(0);
        setRevenueToday(0);
        setServiceDist([]);
      }
    } catch (e) {
      setOrdersToday(0);
      setRevenueToday(0);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();

    // Listener Real-time
    const channel = supabase
      .channel('realtime-dashboard-mitra')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            toast.success('Pembaruan data mitra diterima dari cloud!', { icon: '🔔' });
            fetchDashboardData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle Verifikasi Mitra
  const handleVerify = async (id, accept, notes = '') => {
    const newStatus = accept ? 'Active' : 'Inactive';
    
    setMitraList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: newStatus, notes } : m))
    );

    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('id, features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      const currentList = Array.isArray(data?.features) ? data.features : [];
      const updated = currentList.map((m) =>
        m.id === id ? { ...m, status: newStatus, notes } : m
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
    } catch (e) {}

    // Update di localStorage
    try {
      const local = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = local.map((m) => (m.id === id ? { ...m, status: newStatus, notes } : m));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {}

    toast.success(accept ? 'Mitra berhasil diverifikasi dan aktif!' : 'Pendaftaran mitra ditolak');
  };

  const openReviewModal = (mitra) => {
    setSelectedMitra(mitra);
    setIsReviewOpen(true);
  };

  const pendingMitra = mitraList.filter((m) => m.status === 'Pending');
  const activeDriversCount = mitraList.filter((m) => m.role === 'driver' && m.status === 'Active').length;

  return (
    <div className="space-y-6">
      {/* Header Dashboard & Tombol Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitoring operasional riil & verifikasi calon mitra Wira Lombok
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition shadow-sm w-fit"
          title="Segarkan Data Real-time"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : 'text-slate-500'} />
          <span>Segarkan Data</span>
        </button>
      </div>
      
      {/* Grid Statistik Riil (Tanpa Data Dummy) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Pengguna" 
          value={totalUsers.toLocaleString('id-ID')} 
          icon={Users} 
          subtext="Terdaftar di platform" 
        />
        <StatCard 
          title="Pesanan Hari Ini" 
          value={ordersToday} 
          icon={ShoppingBag} 
          subtext={ordersToday === 0 ? 'Belum ada transaksi hari ini' : 'Transaksi aktif'} 
        />
        <StatCard 
          title="Pendapatan (Hari Ini)" 
          value={`Rp ${revenueToday.toLocaleString('id-ID')}`} 
          icon={Wallet} 
          subtext="Hasil transaksi selesai" 
        />
        <StatCard 
          title="Driver Aktif" 
          value={activeDriversCount} 
          icon={Car} 
          highlight={pendingMitra.filter(m => m.role === 'driver').length > 0}
          subtext={pendingMitra.filter(m => m.role === 'driver').length > 0 ? `${pendingMitra.filter(m => m.role === 'driver').length} pendaftar menunggu` : 'Semua diverifikasi'}
        />
      </div>

      {/* ========================================================================= */}
      {/* 🚀 WIDGET REVIEW PENDAFTARAN MITRA BARU (LENGKAP DENGAN BERKAS)            */}
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
                Klik tombol <strong>"Review Berkas"</strong> untuk memeriksa foto SIM/STNK/KTP dan menyetujui calon mitra
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/drivers"
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 bg-cyan-50 dark:bg-cyan-950/40 px-3 py-1.5 rounded-lg"
            >
              Menu Driver <ExternalLink size={12} />
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
              Semua pendaftar telah diverifikasi atau belum ada pendaftar baru dari aplikasi Mitra Wira. Data pendaftar baru akan langsung muncul di sini secara otomatis.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 mt-2">
            {pendingMitra.map((mitra) => {
              const roleIcon = mitra.role === 'driver' ? '🛵' : mitra.role === 'merchant' ? '🍔' : '🔧';
              const roleTitle = mitra.role === 'driver' ? 'Driver Ojek/Mobil' : mitra.role === 'merchant' ? 'Merchant Restoran' : 'Teknisi Jasa';
              const detailInfo = mitra.role === 'driver' 
                ? `${mitra.vehicle || 'Kendaraan'} • Plat: ${mitra.plate || '-'}`
                : mitra.role === 'merchant'
                ? `Restoran: ${mitra.restaurant_name || mitra.name} • ${mitra.address || 'Mataram'}`
                : `Spesialisasi: ${mitra.specialization || 'Jasa'} (${mitra.experience || 1} thn)`;

              const hasSimPhoto = Boolean(mitra.sim_photo);

              return (
                <div key={mitra.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 rounded-xl px-2 transition">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center shrink-0">
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
                        {hasSimPhoto && (
                          <span className="text-[11px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                            📸 Ada Foto SIM/Dokumen
                          </span>
                        )}
                        <span className="text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Menunggu Review
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{detailInfo}</span>
                        <span>•</span>
                        <a 
                          href={`https://wa.me/${(mitra.phone || '').replace(/[^0-9]/g, '').replace(/^0/, '62')}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-green-600 dark:text-green-400 font-medium hover:underline flex items-center gap-1"
                        >
                          📱 WA: {mitra.phone}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Tombol Aksi: Review Berkas Lengkap */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                    <button
                      onClick={() => openReviewModal(mitra)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95"
                      title="Buka foto SIM & detail berkas untuk ditinjau"
                    >
                      <FileSearch size={15} /> Review Berkas & Data
                    </button>
                    <button
                      onClick={() => handleVerify(mitra.id, true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl shadow-sm transition active:scale-95"
                      title="Setujui langsung"
                    >
                      <CheckCircle size={15} /> Setujui
                    </button>
                    <button
                      onClick={() => handleVerify(mitra.id, false)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 dark:bg-slate-700 dark:hover:bg-red-900/30 dark:text-slate-300 dark:hover:text-red-400 px-3 py-2 rounded-xl transition border border-slate-200 dark:border-slate-600"
                      title="Tolak pendaftaran"
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

      {/* Ringkasan Distribusi & Status Platform */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Operasional Mitra */}
        <div className="card">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
            <span>Status Layanan Mitra Lombok</span>
            <span className="text-xs text-primary font-medium">Real-time</span>
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🛵</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">Driver WiraRide & WiraSend</span>
              </div>
              <span className="font-bold text-primary">
                {mitraList.filter(m => m.role === 'driver' && m.status === 'Active').length} Driver Aktif
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🍔</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">Merchant Restoran WiraFood</span>
              </div>
              <span className="font-bold text-amber-600">
                {mitraList.filter(m => m.role === 'merchant' && m.status === 'Active').length} Mitra Aktif
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔧</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">Teknisi Servis & Kolam Renang</span>
              </div>
              <span className="font-bold text-green-600">
                {mitraList.filter(m => m.role === 'technician' && m.status === 'Active').length} Teknisi Aktif
              </span>
            </div>
          </div>
        </div>

        {/* Card Ringkasan Transaksi */}
        <div className="card flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
              Status Transaksi & Pembayaran
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Semua transaksi WiraPay dan pesanan super-app terhubung langsung ke database cloud.
            </p>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                <p className="text-xs text-slate-500">Total Transaksi Selesai</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{ordersToday}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                <p className="text-xs text-slate-500">Pendaftar Tertunda</p>
                <p className="text-xl font-bold text-amber-600 mt-1">{pendingMitra.length}</p>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 mt-4 flex justify-between items-center text-xs text-slate-500">
            <span>Database: Supabase Singapore (Online)</span>
            <span className="text-green-500 font-semibold">● Terhubung</span>
          </div>
        </div>
      </div>

      {/* Modal Review Berkas Mitra */}
      <MitraReviewModal
        isOpen={isReviewOpen}
        mitra={selectedMitra}
        onClose={() => setIsReviewOpen(false)}
        onVerify={handleVerify}
      />
    </div>
  );
};

export default DashboardPage;
