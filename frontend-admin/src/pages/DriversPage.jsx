import { useState } from 'react';
import { Search, CheckCircle, XCircle, Eye } from 'lucide-react';
import { mockDrivers } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const DriversPage = () => {
  const [drivers, setDrivers] = useState(mockDrivers);
  const [searchTerm, setSearchTerm] = useState('');

  const pendingDrivers = drivers.filter(d => d.status === 'Pending');
  const filteredDrivers = drivers.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.phone.includes(searchTerm)
  );

  const handleVerify = (id, accept) => {
    setDrivers(drivers.map(d => 
      d.id === id ? { ...d, status: accept ? 'Active' : 'Inactive' } : d
    ));
    toast.success(accept ? 'Pengemudi diverifikasi' : 'Pengemudi ditolak');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Pengemudi (Drivers)</h1>
      
      {/* Pending Section Highlight */}
      {pendingDrivers.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Menunggu Verifikasi</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Ada {pendingDrivers.length} pengemudi baru yang membutuhkan verifikasi dokumen.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {pendingDrivers.map(driver => (
              <div key={driver.id} className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded shadow-sm">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{driver.name}</p>
                  <p className="text-xs text-slate-500">{driver.vehicle} - {driver.plate}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleVerify(driver.id, true)} className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200">
                    <CheckCircle size={16} /> Verifikasi
                  </button>
                  <button onClick={() => handleVerify(driver.id, false)} className="flex items-center gap-1 text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200">
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
              placeholder="Cari nama atau nomor HP..." 
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Kendaraan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Rating</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Total Trip</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredDrivers.map(driver => (
                <tr key={driver.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{driver.name}</div>
                    <div className="text-slate-500">{driver.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div>{driver.vehicle}</div>
                    <div className="text-slate-500 text-xs">{driver.plate}</div>
                  </td>
                  <td className="px-6 py-4">{driver.rating > 0 ? `⭐ ${driver.rating}` : '-'}</td>
                  <td className="px-6 py-4">{driver.trips}</td>
                  <td className="px-6 py-4"><StatusBadge status={driver.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-primary hover:text-cyan-700 p-2" title="Detail">
                      <Eye size={18} />
                    </button>
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

export default DriversPage;
