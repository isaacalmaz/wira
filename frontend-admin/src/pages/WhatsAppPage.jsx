import { useState } from 'react';
import { Search, MessageSquare, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { mockWhatsappLogs } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';

const StatCard = ({ title, value, type }) => (
  <div className="card flex flex-col justify-between p-5">
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
    <h3 className={`text-2xl font-bold ${type === 'highlight' ? 'text-green-500' : 'text-slate-900 dark:text-white'}`}>{value}</h3>
  </div>
);

const WhatsAppPage = () => {
  const [logs] = useState(mockWhatsappLogs);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = logs.filter(l => 
    l.from.includes(searchTerm) ||
    l.to.includes(searchTerm) ||
    l.preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Log & Notifikasi WhatsApp</h1>
        <button className="btn-primary flex items-center gap-2">
          <MessageSquare size={18} /> Kelola Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Pesan Terkirim (Hari Ini)" value="1,245" type="highlight" />
        <StatCard title="Tingkat Pengiriman" value="99.8%" />
        <StatCard title="Pesan Masuk" value="86" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nomor atau isi pesan..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2 w-full" 
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Arah</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Pengirim / Penerima</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white w-1/3">Pratinjau Pesan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Waktu</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 text-slate-500">
                    {l.type === 'Outgoing' ? <ArrowUpRight className="text-green-500" size={20} /> : <ArrowDownLeft className="text-blue-500" size={20} />}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{l.type === 'Outgoing' ? l.to : l.from}</div>
                    <div className="text-xs text-slate-500">{l.type === 'Outgoing' ? 'Penerima' : 'Pengirim'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 truncate max-w-xs">{l.preview}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{l.timestamp}</td>
                  <td className="px-6 py-4"><StatusBadge status={l.status} /></td>
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

export default WhatsAppPage;
