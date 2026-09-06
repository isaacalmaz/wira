import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { ShoppingBag, Search } from 'lucide-react';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="text-primary"/> Pantauan Transaksi</h1>
        <p className="text-sm text-slate-500">Seluruh pesanan yang masuk ke ekosistem Wira</p>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center">Memuat...</div> : (
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
              {orders.map(o => (
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
