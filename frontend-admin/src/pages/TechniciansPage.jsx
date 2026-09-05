import { useState } from 'react';
import { Search, CheckCircle, XCircle, Eye } from 'lucide-react';
import { mockTechnicians } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const TechniciansPage = () => {
  const [technicians, setTechnicians] = useState(mockTechnicians);
  const [searchTerm, setSearchTerm] = useState('');

  const pending = technicians.filter(t => t.status === 'Pending');
  const filtered = technicians.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.specialization.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVerify = (id, accept) => {
    setTechnicians(technicians.map(t => 
      t.id === id ? { ...t, status: accept ? 'Active' : 'Inactive' } : t
    ));
    toast.success(accept ? 'Teknisi diverifikasi' : 'Teknisi ditolak');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Teknisi (WiraService)</h1>
      
      {pending.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-3">Menunggu Verifikasi</h3>
          <div className="flex flex-col gap-3">
            {pending.map(tech => (
              <div key={tech.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded shadow-sm">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{tech.name}</p>
                  <p className="text-xs text-slate-500">Spesialisasi: {tech.specialization} | {tech.phone}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleVerify(tech.id, true)} className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded">
                    <CheckCircle size={16} /> Terima
                  </button>
                  <button onClick={() => handleVerify(tech.id, false)} className="flex items-center gap-1 text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded">
                    <XCircle size={16} /> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau spesialisasi..." 
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nama / Kontak</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Spesialisasi</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Rating</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Total Pekerjaan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{t.name}</div>
                    <div className="text-slate-500 text-xs">{t.phone}</div>
                  </td>
                  <td className="px-6 py-4">{t.specialization}</td>
                  <td className="px-6 py-4">{t.rating > 0 ? `⭐ ${t.rating}` : '-'}</td>
                  <td className="px-6 py-4">{t.totalJobs}</td>
                  <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-primary p-2"><Eye size={18} /></button>
                  </td>
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

export default TechniciansPage;
