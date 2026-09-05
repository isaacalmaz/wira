import { useState } from 'react';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { mockPromos } from '../data/mockData2';
import { StatusBadge, Pagination, ConfirmModal } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const PromosPage = () => {
  const [promos, setPromos] = useState(mockPromos);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);

  const filtered = promos.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = () => {
    setPromos(promos.filter(p => p.id !== selectedPromo.id));
    toast.success('Promo berhasil dihapus');
    setIsDeleteOpen(false);
  };

  const toggleStatus = (id) => {
    setPromos(promos.map(p => 
      p.id === id ? { ...p, status: p.status === 'Active' ? 'Inactive' : 'Active' } : p
    ));
    toast.success('Status promo diubah');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Promo</h1>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Tambah Promo
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau kode promo..." 
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nama Promo</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Kode</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Diskon</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Berlaku s/d</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Digunakan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{p.title}</td>
                  <td className="px-6 py-4"><span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono text-xs">{p.code}</span></td>
                  <td className="px-6 py-4 font-medium text-primary">
                    {p.type === 'Percentage' ? `${p.discount}%` : `Rp ${p.discount.toLocaleString('id-ID')}`}
                  </td>
                  <td className="px-6 py-4">{p.validUntil}</td>
                  <td className="px-6 py-4">{p.usage}x</td>
                  <td className="px-6 py-4">
                    <button onClick={() => toggleStatus(p.id)} className="focus:outline-none">
                      <StatusBadge status={p.status} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-500 hover:text-blue-700 p-2 mr-1"><Edit size={18} /></button>
                    <button onClick={() => { setSelectedPromo(p); setIsDeleteOpen(true); }} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>

      <ConfirmModal 
        isOpen={isDeleteOpen} 
        title="Hapus Promo" 
        message={`Hapus promo ${selectedPromo?.code}?`}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default PromosPage;
