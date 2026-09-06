import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Download, Search, Filter, RefreshCw, DollarSign, TrendingUp, Calendar, CreditCard } from 'lucide-react';
import { Pagination } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, icon: Icon, color = 'text-primary' }) => (
  <div className="card flex items-center justify-between p-5">
    <div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
      <h3 className={`text-2xl font-bold ${color}`}>{value}</h3>
    </div>
    <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
      <Icon size={24} className={color} />
    </div>
  </div>
);

const FinancePage = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    today: 0,
    week: 0,
    month: 0,
    total: 0
  });

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      // Fetch completed and ongoing orders from Supabase
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const orderList = data || [];
      
      // Calculate real stats
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      let todayRev = 0;
      let weekRev = 0;
      let monthRev = 0;
      let totalRev = 0;

      const mappedTransactions = orderList.map(order => {
        const orderDate = new Date(order.created_at || now);
        const amount = Number(order.total_amount || order.price || order.fare || 0);

        if (order.status !== 'cancelled') {
          totalRev += amount;
          if (orderDate.toISOString().split('T')[0] === todayStr) {
            todayRev += amount;
          }
          if (orderDate >= sevenDaysAgo) {
            weekRev += amount;
          }
          if (orderDate >= thirtyDaysAgo) {
            monthRev += amount;
          }
        }

        return {
          id: order.id ? `TRX-${String(order.id).slice(0, 8).toUpperCase()}` : 'TRX-UNKNOWN',
          rawId: order.id,
          user: order.customer_name || order.user_phone || order.user_id || 'Pengguna Wira',
          service: order.service_type || 'WiraRide',
          amount: amount,
          status: order.status || 'completed',
          date: order.created_at ? new Date(order.created_at).toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
          rawDate: order.created_at
        };
      });

      setStats({
        today: todayRev,
        week: weekRev,
        month: monthRev,
        total: totalRev
      });

      setTransactions(mappedTransactions);
    } catch (err) {
      console.error('Error fetching finance:', err);
      toast.error('Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const exportToCSV = () => {
    if (transactions.length === 0) {
      toast.error('Tidak ada data transaksi untuk diekspor');
      return;
    }

    const headers = ['ID Transaksi', 'Pelanggan / Pengguna', 'Layanan', 'Jumlah (Rp)', 'Status', 'Tanggal'];
    const rows = transactions.map(t => [
      t.id,
      `"${t.user}"`,
      t.service,
      t.amount,
      t.status,
      `"${t.date}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `laporan_keuangan_wira_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Laporan transaksi berhasil diunduh (CSV)');
  };

  const filtered = transactions.filter(t => {
    const matchesSearch = t.user.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.service.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'All' || 
                          (filterType === 'Completed' && t.status === 'completed') ||
                          (filterType === 'Cancelled' && t.status === 'cancelled') ||
                          (filterType === 'Pending' && t.status === 'pending');
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Keuangan & Transaksi</h1>
          <p className="text-sm text-slate-500">Rekapitulasi omzet dan riwayat pembayaran riil</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchFinanceData} 
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Muat Ulang"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={exportToCSV}
            className="btn-primary flex items-center gap-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white"
          >
            <Download size={18} /> Ekspor Data CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Pendapatan (Hari Ini)" value={`Rp ${stats.today.toLocaleString('id-ID')}`} icon={DollarSign} color="text-primary" />
        <StatCard title="Minggu Ini (7 Hari)" value={`Rp ${stats.week.toLocaleString('id-ID')}`} icon={TrendingUp} color="text-emerald-500" />
        <StatCard title="Bulan Ini" value={`Rp ${stats.month.toLocaleString('id-ID')}`} icon={Calendar} color="text-blue-500" />
        <StatCard title="Total Keseluruhan" value={`Rp ${stats.total.toLocaleString('id-ID')}`} icon={CreditCard} color="text-purple-500" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari ID TRX, Pengguna, atau Layanan..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2 w-full" 
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="input-field py-2"
            >
              <option value="All">Semua Status</option>
              <option value="Completed">Selesai</option>
              <option value="Pending">Menunggu / Berjalan</option>
              <option value="Cancelled">Dibatalkan</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">ID Transaksi</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Pengguna</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Layanan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nominal</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    <CreditCard size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">Belum ada transaksi tercatat</p>
                    <p className="text-xs text-slate-400 mt-1">Transaksi pesanan pelanggan akan muncul secara otomatis di sini</p>
                  </td>
                </tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-white">{t.id}</td>
                    <td className="px-6 py-4 font-medium">{t.user}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {t.service}
                      </span>
                    </td>
                    <td className={`px-6 py-4 font-semibold ${t.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      Rp {t.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        t.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        t.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {t.status === 'completed' ? 'Selesai' : t.status === 'cancelled' ? 'Dibatalkan' : 'Dalam Proses'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{t.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>
    </div>
  );
};

export default FinancePage;
