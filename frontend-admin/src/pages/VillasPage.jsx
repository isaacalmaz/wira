import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Home, RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '../config/supabase';
import { StatusBadge, ConfirmModal } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const VillasPage = () => {
  const [villas, setVillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVilla, setSelectedVilla] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    area: '',
    price: '',
    bedrooms: '2',
    status: 'Tersedia',
    rating: '5.0'
  });

  const fetchVillas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('region', 'villas_catalog')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && Array.isArray(data.features)) {
        setVillas(data.features);
      } else {
        // Empty catalog initially or load empty state
        setVillas([]);
      }
    } catch (err) {
      console.error('Error loading villas:', err);
      // fallback to localStorage
      const cached = localStorage.getItem('wira_villas_catalog');
      if (cached) {
        setVillas(JSON.parse(cached));
      } else {
        setVillas([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVillas();
  }, []);

  const saveVillasToCloud = async (updatedList) => {
    setVillas(updatedList);
    localStorage.setItem('wira_villas_catalog', JSON.stringify(updatedList));

    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'villas_catalog',
          features: updatedList,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (error) {
        console.warn('Could not sync villas with cloud, saved locally:', error);
      }
    } catch (err) {
      console.warn('Could not sync villas with cloud:', err);
    }
  };

  const handleOpenAdd = () => {
    setSelectedVilla(null);
    setFormData({
      name: '',
      area: 'Senggigi, Lombok Barat',
      price: '1500000',
      bedrooms: '2',
      status: 'Tersedia',
      rating: '5.0'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (villa) => {
    setSelectedVilla(villa);
    setFormData({
      name: villa.name,
      area: villa.area,
      price: villa.price,
      bedrooms: String(villa.bedrooms),
      status: villa.status,
      rating: String(villa.rating || '5.0')
    });
    setIsModalOpen(true);
  };

  const handleSaveVilla = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nama villa wajib diisi');
      return;
    }

    let updated;
    if (selectedVilla) {
      // Edit
      updated = villas.map(v => 
        v.id === selectedVilla.id 
          ? { 
              ...v, 
              name: formData.name, 
              area: formData.area, 
              price: Number(formData.price) || 0, 
              bedrooms: Number(formData.bedrooms) || 1, 
              status: formData.status 
            } 
          : v
      );
      toast.success('Data villa berhasil diperbarui');
    } else {
      // Add
      const newVilla = {
        id: 'villa_' + Date.now(),
        name: formData.name,
        area: formData.area,
        price: Number(formData.price) || 0,
        bedrooms: Number(formData.bedrooms) || 1,
        rating: Number(formData.rating) || 5.0,
        bookings: 0,
        status: formData.status
      };
      updated = [newVilla, ...villas];
      toast.success('Villa baru berhasil ditambahkan');
    }

    await saveVillasToCloud(updated);
    setIsModalOpen(false);
  };

  const handleDelete = async () => {
    const updated = villas.filter(v => v.id !== selectedVilla.id);
    await saveVillasToCloud(updated);
    toast.success('Villa berhasil dihapus');
    setIsDeleteOpen(false);
  };

  const filtered = villas.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Villa (WiraVilla)</h1>
          <p className="text-sm text-slate-500">Kelola daftar akomodasi dan villa mitra di Lombok</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchVillas} 
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Muat Ulang"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Tambah Villa
          </button>
        </div>
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Kamar Tidur</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Rating</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    <Home size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">Belum ada villa terdaftar</p>
                    <p className="text-xs text-slate-400 mt-1">Klik tombol "Tambah Villa" di atas untuk menambahkan villa baru</p>
                  </td>
                </tr>
              ) : (
                filtered.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{v.name}</div>
                      <div className="text-slate-500 text-xs">{v.area}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-primary">Rp {Number(v.price).toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4">{v.bedrooms} Kamar Tidur</td>
                    <td className="px-6 py-4">⭐ {v.rating || '5.0'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        v.status === 'Tersedia' || v.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleOpenEdit(v)} className="text-blue-500 hover:text-blue-700 p-2 mr-1" title="Edit">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => { setSelectedVilla(v); setIsDeleteOpen(true); }} className="text-red-500 hover:text-red-700 p-2" title="Hapus">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit Villa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                {selectedVilla ? 'Edit Villa' : 'Tambah Villa Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVilla} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Villa</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Sunset Villa Senggigi" 
                  className="input-field w-full" 
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Area / Lokasi</label>
                <input 
                  type="text" 
                  value={formData.area} 
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  placeholder="Contoh: Senggigi, Lombok Barat" 
                  className="input-field w-full" 
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Harga per Malam (Rp)</label>
                  <input 
                    type="number" 
                    value={formData.price} 
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="1500000" 
                    className="input-field w-full" 
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah Kamar Tidur</label>
                  <input 
                    type="number" 
                    value={formData.bedrooms} 
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                    placeholder="2" 
                    className="input-field w-full" 
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status Ketersediaan</label>
                <select 
                  value={formData.status} 
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input-field w-full"
                >
                  <option value="Tersedia">Tersedia</option>
                  <option value="Penuh / Dipesan">Penuh / Dipesan</option>
                  <option value="Pemeliharaan">Pemeliharaan</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                  Batal
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Check size={18} /> Simpan Villa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={isDeleteOpen} 
        title="Hapus Villa" 
        message={`Apakah Anda yakin ingin menghapus "${selectedVilla?.name}"? Tindakan ini tidak dapat dibatalkan.`}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default VillasPage;
