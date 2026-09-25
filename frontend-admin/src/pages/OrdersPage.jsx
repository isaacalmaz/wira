import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { ShoppingBag, Search } from 'lucide-react';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOrders = async () => {
    setLoading(true);
    // Kita ambil juga data user dan driver agar tau nama pelakunya
    const { data } = await supabase.from('orders')
      .select('*, user:users!user_id(name), driver:users!driver_id(name)')
      .order('created_at', { ascending: false });

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
      if (!term) return true;
      return (
        o.id?.toLowerCase().includes(term) ||
        o.user?.name?.toLowerCase().includes(term) ||
        o.driver?.name?.toLowerCase().includes(term)
      );
    });
  }, [orders, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="text-primary"/> Pantauan Transaksi</h1>
          <p className="text-sm text-slate-500">Seluruh pesanan yang masuk ke ekosistem Wira</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari ID pesanan / nama pelanggan / driver..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm w-full sm:w-72"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
          >
            <option value="all">Semua Status</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center">Memuat...</div> : filteredOrders.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            {orders.length === 0 ? 'Belum ada pesanan.' : 'Tidak ada pesanan yang cocok dengan pencarian/filter.'}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4">ID Pesanan</th>
                <th className="px-6 py-4">Layanan</th>
                <th className="px-6 py-4">Pelanggan</th>
                <th className="px-6 py-4">Driver/Mitra</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-xs">{o.id.slice(0,8)}</td>
                  <td className="px-6 py-4 uppercase font-bold text-xs">{o.service_type}</td>
                  <td className="px-6 py-4">{o.user?.name || 'Anonim'}</td>
                  <td className="px-6 py-4">{o.driver?.name || '-'}</td>
                  <td className="px-6 py-4 font-semibold">Rp {(o.total_price || 0).toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                      o.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      o.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default OrdersPage;
