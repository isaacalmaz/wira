import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const VillasPage = () => {
  const [villas, setVillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchVillas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('merchants')
      .select('*')
      .eq('service_type', 'villa')
      .order('created_at', { ascending: false });
    
    setVillas(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchVillas();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus vila ini?')) return;
    await supabase.from('merchants').delete().eq('id', id);
    toast.success('Vila berhasil dihapus');
    fetchVillas();
  };

  const filtered = villas.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Vila</h1>
          <p className="text-sm text-slate-500">Kelola properti WiraVilla.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchVillas} className="p-2 border rounded-xl hover:bg-slate-50 dark:border-slate-700">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl" onClick={() => toast('Fitur tambah vila dalam pengembangan')}>
            <Plus size={20} /> Tambah Vila
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
            <input type="text" placeholder="Cari nama vila..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
              <tr>
                <th className="p-4 font-semibold">Nama Vila</th>
                <th className="p-4 font-semibold">Alamat</th>
                <th className="p-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map(v => (
                <tr key={v.id}>
                  <td className="p-4 font-bold text-slate-900 dark:text-white">{v.name}</td>
                  <td className="p-4 text-slate-500">{v.address}</td>
                  <td className="p-4">
                    <button className="text-red-600 p-1.5" onClick={() => handleDelete(v.id)}>
                      <Trash2 size={16} />
                    </button>
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
export default VillasPage;
