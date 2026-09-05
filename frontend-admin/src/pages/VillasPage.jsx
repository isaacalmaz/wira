import { useState } from 'react';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { mockVillas } from '../data/mockData2';
import { StatusBadge, FormField, Pagination, ConfirmModal } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const VillasPage = () => {
  const [villas, setVillas] = useState(mockVillas);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVilla, setSelectedVilla] = useState(null);

  const filtered = villas.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = () => {
    setVillas(villas.filter(v => v.id !== selectedVilla.id));
    toast.success('Villa berhasil dihapus');
    setIsDeleteOpen(false);
  };

  const openDeleteModal = (villa) => {
    setSelectedVilla(villa);
    setIsDeleteOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Villa (WiraVilla)</h1>
        <button onClick={() => { setSelectedVilla(null); setIsModalOpen(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Tambah Villa
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari nama atau area villa..." 
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Nama / Area</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Harga per Malam</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Fasilitas Utama</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Rating/Booking</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{v.name}</div>
                    <div className="text-slate-500 text-xs">{v.area}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-primary">Rp {v.price.toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4">{v.bedrooms} Kamar Tidur</td>
                  <td className="px-6 py-4">⭐ {v.rating} ({v.bookings} kali)</td>
                  <td className="px-6 py-4"><StatusBadge status={v.status} /></td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-500 hover:text-blue-700 p-2 mr-1"><Edit size={18} /></button>
                    <button onClick={() => openDeleteModal(v)} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={18} /></button>
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
        title="Hapus Villa" 
        message={`Apakah Anda yakin ingin menghapus ${selectedVilla?.name}? Aksi ini tidak dapat dibatalkan.`}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default VillasPage;
