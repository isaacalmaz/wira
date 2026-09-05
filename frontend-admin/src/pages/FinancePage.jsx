import { useState } from 'react';
import { financeStats, mockTransactions } from '../data/mockData2';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Search, Filter } from 'lucide-react';
import { Pagination } from '../components/common/UIComponents';

const StatCard = ({ title, value, type }) => (
  <div className="card flex flex-col justify-between p-5">
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
    <h3 className={`text-2xl font-bold ${type === 'highlight' ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>{value}</h3>
  </div>
);

const FinancePage = () => {
  const [filterType, setFilterType] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const types = ['All', 'Payment', 'Topup', 'Withdrawal', 'Refund'];

  const filtered = mockTransactions.filter(t => 
    (filterType === 'All' || t.type === filterType) &&
    (t.user.toLowerCase().includes(searchTerm.toLowerCase()) || t.id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Keuangan & Transaksi</h1>
        <button className="btn-primary flex items-center gap-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white">
          <Download size={18} /> Ekspor Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Pendapatan (Hari Ini)" value={`Rp ${financeStats.revenueToday.toLocaleString('id-ID')}`} type="highlight" />
        <StatCard title="Minggu Ini" value={`Rp ${financeStats.revenueWeek.toLocaleString('id-ID')}`} />
        <StatCard title="Bulan Ini" value={`Rp ${financeStats.revenueMonth.toLocaleString('id-ID')}`} />
        <StatCard title="Total Keseluruhan" value={`Rp ${financeStats.revenueTotal.toLocaleString('id-ID')}`} />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Tren Pendapatan (30 Hari Terakhir)</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={financeStats.trend30Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey="date" stroke="#64748b" tick={{fontSize: 12}} />
              <YAxis stroke="#64748b" tickFormatter={(v) => `Rp${v/1000000}M`} />
              <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }} />
              <Line type="monotone" dataKey="revenue" stroke="#0891B2" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari ID TRX atau User..." 
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
              {types.map(t => <option key={t} value={t}>{t === 'All' ? 'Semua Tipe' : t}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">ID Transaksi</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Pengguna</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Tipe</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Jumlah</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Keterangan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{t.id}</td>
                  <td className="px-6 py-4">{t.user}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      t.type === 'Payment' ? 'bg-blue-100 text-blue-700' :
                      t.type === 'Topup' ? 'bg-green-100 text-green-700' :
                      t.type === 'Withdrawal' ? 'bg-purple-100 text-purple-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className={`px-6 py-4 font-medium ${t.type === 'Topup' || t.type === 'Payment' ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>
                    {t.type === 'Withdrawal' || t.type === 'Refund' ? '-' : '+'}Rp {t.amount.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{t.desc}</td>
                  <td className="px-6 py-4 text-slate-500">{t.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>
    </div>
  );
};

export default FinancePage;
