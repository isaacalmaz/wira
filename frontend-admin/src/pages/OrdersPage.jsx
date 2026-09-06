import { useState, useEffect } from 'react';
import { mockOrders } from '../data/mockData';
import { Search, Filter, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const OrdersPage = () => {
  const [orders, setOrders] = useState(mockOrders);
  const [activeTab, setActiveTab] = useState('Semua');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const tabs = ['Semua', 'WiraRide', 'WiraFood', 'WiraSend', 'WiraVilla', 'WiraService', 'WiraPool', 'WiraPulsa'];

  const fetchSupabaseOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const formatted = data.map((o) => {
          const sType = o.service_type || 'ride';
          const serviceName =
            sType === 'ride' ? 'WiraRide' :
            sType === 'food' ? 'WiraFood' :
            sType === 'send' ? 'WiraSend' :
            sType === 'villa' ? 'WiraVilla' :
            sType === 'service' ? 'WiraService' :
            sType === 'pool' ? 'WiraPool' : 'WiraPulsa';

          return {
            id: o.id.slice(0, 8).toUpperCase(),
            rawId: o.id,
            service: serviceName,
            customer: 'Pelanggan Wira',
            partner: 'Mitra Lombok',
            amount: Number(o.total_price) || 25000,
            status: o.status === 'completed' ? 'completed' : o.status === 'cancelled' ? 'cancelled' : 'active',
            date: new Date(o.created_at).toLocaleString('id-ID'),
            isReal: true,
          };
        });

        setOrders((prev) => {
          const existingRealIds = new Set(formatted.map((f) => f.rawId));
          const onlyMock = prev.filter((p) => !existingRealIds.has(p.rawId) && !p.isReal);
          return [...formatted, ...onlyMock];
        });
      }
    } catch (err) {
      console.log('Using local orders fallback', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupabaseOrders();

    // Notifikasi Real-time pesanan baru dari pengguna
    const channel = supabase
      .channel('realtime-admin-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.new) {
            toast.success(`Pesanan baru masuk: ${payload.new.service_type?.toUpperCase()}!`, {
              icon: '📦',
              duration: 6000,
            });
            fetchSupabaseOrders();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdateStatus = async (order, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
    );

    if (order.isReal && order.rawId) {
      try {
        await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', order.rawId);
      } catch (err) {
        console.log('Update local only', err);
      }
    }

    toast.success(`Status pesanan ${order.id} diubah ke ${newStatus}`);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'active':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchTab = activeTab === 'Semua' || order.service === activeTab;
    const matchSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.service.toLowerCase().includes(searchTerm.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Daftar Pesanan (Semua Layanan)
        </h1>
        <button
          onClick={fetchSupabaseOrders}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex space-x-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  activeTab === tab
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Cari ID/Layanan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10 py-1.5 w-full sm:w-60 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Tabel Pesanan */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  ID Pesanan
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Layanan
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Pelanggan
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Mitra
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Total
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <td className="px-6 py-4 font-mono font-bold text-primary flex items-center gap-1.5">
                    {order.id}
                    {order.isReal && (
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Pesanan Live"></span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                    {order.service}
                  </td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                    {order.customer}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{order.partner}</td>
                  <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">
                    Rp {order.amount.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      {order.status !== 'completed' && (
                        <button
                          onClick={() => handleUpdateStatus(order, 'completed')}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Tandai Selesai"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {order.status !== 'cancelled' && (
                        <button
                          onClick={() => handleUpdateStatus(order, 'cancelled')}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Batalkan Pesanan"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
