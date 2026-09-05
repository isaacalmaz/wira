import { useState } from 'react';
import { mockOrders } from '../data/mockData';
import { Search, Filter } from 'lucide-react';

const OrdersPage = () => {
  const [activeTab, setActiveTab] = useState('Semua');

  const tabs = ['Semua', 'WiraRide', 'WiraFood', 'WiraSend', 'WiraVilla'];

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'active': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Daftar Pesanan</h1>
      </div>

      <div className="card p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex space-x-2 overflow-x-auto pb-2 sm:pb-0">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-primary text-white' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Cari ID/Pelanggan..." className="input-field pl-10 py-2 w-full sm:w-64" />
            </div>
            <button className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Filter size={18} />
            </button>
          </div>
        </div>

        {/* Tabel */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">ID Pesanan</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Pelanggan</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Layanan</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Total</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Tanggal</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {mockOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-primary">{order.id}</td>
                  <td className="px-6 py-4 text-slate-900 dark:text-white">{order.user}</td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{order.type}</td>
                  <td className="px-6 py-4 text-slate-900 dark:text-white">Rp {order.total.toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{order.date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
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
