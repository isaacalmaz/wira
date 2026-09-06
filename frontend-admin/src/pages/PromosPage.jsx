import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Tag, RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '../config/supabase';
import { ConfirmModal } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const PromosPage = () => {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    code: '',
    type: 'Percentage',
    discount: '20',
    validUntil: '',
    status: 'Active'
  });

  const fetchPromos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('region', 'promos_catalog')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && Array.isArray(data.features)) {
        setPromos(data.features);
      } else {
        setPromos([]);
      }
    } catch (err) {
      console.error('Error fetching promos:', err);
      const cached = localStorage.getItem('wira_promos_catalog');
      if (cached) {
        setPromos(JSON.parse(cached));
      } else {
        setPromos([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  const savePromosToCloud = async (updated) => {
    setPromos(updated);
    localStorage.setItem('wira_promos_catalog', JSON.stringify(updated));

    try {
      await supabase
        .from('feature_flags')
        .upsert({
          region: 'promos_catalog',
          features: updated,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });
    } catch (err) {
      console.warn('Could not sync promos with cloud:', err);
    }
  };

  const handleOpenAdd = () => {
    setSelectedPromo(null);
    setFormData({
      title: '',
      code: '',
      type: 'Percentage',
      discount: '20',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Active'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (promo) => {
    setSelectedPromo(promo);
    setFormData({
      title: promo.title,
      code: promo.code,
      type: promo.type,
      discount: String(promo.discount),
      validUntil: promo.validUntil || '',
      status: promo.status
    });
    setIsModalOpen(true);
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) {
      toast.error('Judul dan Kode promo wajib diisi');
      return;
    }

    let updated;
    if (selectedPromo) {
      updated = promos.map(p => 
        p.id === selectedPromo.id 
          ? {
              ...p,
              title: formData.title,
              code: formData.code.toUpperCase().replace(/\s+/g, ''),
              type: formData.type,
              discount: Number(formData.discount) || 0,
              validUntil: formData.validUntil,
              status: formData.status
            }
          : p
      );
      toast.success('Promo berhasil diperbarui');
    } else {
      const newPromo = {
        id: 'promo_' + Date.now(),
        title: formData.title,
        code: formData.code.toUpperCase().replace(/\s+/g, ''),
        type: formData.type,
        discount: Number(formData.discount) || 0,
        validUntil: formData.validUntil,
        usage: 0,
        status: formData.status
      };
      updated = [newPromo, ...promos];
      toast.success('Promo baru berhasil dibuat');
    }

    await savePromosToCloud(updated);
    setIsModalOpen(false);
  };

  const toggleStatus = async (id) => {
    const updated = promos.map(p => 
      p.id === id ? { ...p, status: p.status === 'Active' ? 'Inactive' : 'Active' } : p
    );
    await savePromosToCloud(updated);
    toast.success('Status promo diubah');
  };

  const handleDelete = async () => {
    const updated = promos.filter(p => p.id !== selectedPromo.id);
    await savePromosToCloud(updated);
    toast.success('Promo berhasil dihapus');
    setIsDeleteOpen(false);
  };

  const filtered = promos.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Promo & Kupon</h1>
          <p className="text-sm text-slate-500">Kelola voucher diskon dan penawaran khusus pengguna</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchPromos} 
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Muat Ulang"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Tambah Promo
          </button>
        </div>
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
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Kode Voucher</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Potongan Diskon</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Berlaku s/d</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Penggunaan</th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    <Tag size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">Belum ada promo aktif</p>
                    <p className="text-xs text-slate-400 mt-1">Klik tombol "Tambah Promo" untuk membuat voucher diskon baru</p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{p.title}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded font-mono text-xs font-bold tracking-wider">
                        {p.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-primary">
                      {p.type === 'Percentage' ? `${p.discount}%` : `Rp ${Number(p.discount).toLocaleString('id-ID')}`}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{p.validUntil || '-'}</td>
                    <td className="px-6 py-4">{p.usage || 0}x dipakai</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleStatus(p.id)} 
                        className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                          p.status === 'Active' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                        title="Klik untuk ubah status"
                      >
                        {p.status === 'Active' ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleOpenEdit(p)} className="text-blue-500 hover:text-blue-700 p-2 mr-1" title="Edit">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => { setSelectedPromo(p); setIsDeleteOpen(true); }} className="text-red-500 hover:text-red-700 p-2" title="Hapus">
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

      {/* Modal Add/Edit Promo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                {selectedPromo ? 'Edit Promo' : 'Buat Promo Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePromo} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Promo</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Contoh: Diskon Pengguna Baru Wira" 
                  className="input-field w-full" 
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kode Voucher</label>
                <input 
                  type="text" 
                  value={formData.code} 
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Contoh: WIRABARU" 
                  className="input-field w-full uppercase font-mono" 
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipe Potongan</label>
                  <select 
                    value={formData.type} 
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="input-field w-full"
                  >
                    <option value="Percentage">Persentase (%)</option>
                    <option value="Fixed">Nominal Tetap (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {formData.type === 'Percentage' ? 'Diskon (%)' : 'Diskon (Rp)'}
                  </label>
                  <input 
                    type="number" 
                    value={formData.discount} 
                    onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                    placeholder={formData.type === 'Percentage' ? '20' : '10000'} 
                    className="input-field w-full" 
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Berlaku Sampai</label>
                  <input 
                    type="date" 
                    value={formData.validUntil} 
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="input-field w-full" 
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input-field w-full"
                  >
                    <option value="Active">Aktif</option>
                    <option value="Inactive">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                  Batal
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Check size={18} /> Simpan Promo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={isDeleteOpen} 
        title="Hapus Promo" 
        message={`Apakah Anda yakin ingin menghapus promo "${selectedPromo?.code}"?`}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
};

export default PromosPage;
