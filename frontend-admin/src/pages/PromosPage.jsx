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

  const emptyFormData = {
    title: '',
    description: '',
    code: '',
    service_type: '',
    type: 'Percentage',
    discount: '20',
    validUntil: '',
    status: 'Active',
    usage_limit: ''
  };
  const [formData, setFormData] = useState(emptyFormData);

  const fetchPromos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPromos(data || []);
    } catch (err) {
      console.error('Error fetching promos:', err);
      toast.error('Gagal memuat promo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
  }, []);

  const handleOpenAdd = () => {
    setSelectedPromo(null);
    setFormData(emptyFormData);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (promo) => {
    setSelectedPromo(promo);
    setFormData({
      title: promo.title || '',
      description: promo.description || '',
      code: promo.code || '',
      service_type: promo.service_type || '',
      type: promo.type || 'Percentage',
      discount: String(promo.discount ?? 0),
      validUntil: promo.validUntil || '',
      status: promo.status || 'Active',
      usage_limit: promo.usage_limit != null ? String(promo.usage_limit) : ''
    });
    setIsModalOpen(true);
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.code.trim()) {
      toast.error('Judul dan Kode promo wajib diisi');
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      code: formData.code.toUpperCase().replace(/\s+/g, ''),
      service_type: formData.service_type?.trim() || null,
      type: formData.type,
      discount: Number(formData.discount) || 0,
      validUntil: formData.validUntil || null,
      status: formData.status,
      usage_limit: formData.usage_limit === '' ? null : Number(formData.usage_limit),
    };

    try {
      if (selectedPromo) {
        const { data, error } = await supabase
          .from('promos')
          .update(payload)
          .eq('id', selectedPromo.id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak atau promo tidak ditemukan.');
        toast.success('Promo berhasil diperbarui');
      } else {
        const { data, error } = await supabase
          .from('promos')
          .insert([{ ...payload, usage: 0 }])
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak saat membuat promo.');
        toast.success('Promo baru berhasil dibuat');
      }
      setIsModalOpen(false);
      fetchPromos();
    } catch (err) {
      console.error('Error saving promo:', err);
      toast.error(err.message || 'Gagal menyimpan promo');
    }
  };

  const toggleStatus = async (promo) => {
    try {
      const newStatus = promo.status === 'Active' ? 'Inactive' : 'Active';
      const { data, error } = await supabase
        .from('promos')
        .update({ status: newStatus })
        .eq('id', promo.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak.');
      setPromos(prev => prev.map(p => (p.id === promo.id ? { ...p, status: newStatus } : p)));
      toast.success('Status promo diubah');
    } catch (err) {
      console.error('Error toggling promo status:', err);
      toast.error(err.message || 'Gagal mengubah status promo');
    }
  };

  const handleDelete = async () => {
    try {
      const { data, error } = await supabase
        .from('promos')
        .delete()
        .eq('id', selectedPromo.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau promo tidak ditemukan.');
      setPromos(prev => prev.filter(p => p.id !== selectedPromo.id));
      toast.success('Promo berhasil dihapus');
    } catch (err) {
      console.error('Error deleting promo:', err);
      toast.error(err.message || 'Gagal menghapus promo');
    } finally {
      setIsDeleteOpen(false);
    }
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
                    <td className="px-6 py-4">
                      {p.usage || 0}{p.usage_limit != null ? ` / ${p.usage_limit}` : ''}x dipakai
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleStatus(p)}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Layanan (opsional)
                  </label>
                  <select
                    value={formData.service_type}
                    onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                    className="input-field w-full"
                  >
                    <option value="">Semua Layanan</option>
                    <option value="ride">WiraRide</option>
                    <option value="food">WiraFood</option>
                    <option value="send">WiraSend</option>
                    <option value="villa">WiraVilla</option>
                    <option value="service">WiraService</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Batas Pemakaian (kosongkan = tanpa batas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usage_limit}
                    onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                    placeholder="Tanpa batas"
                    className="input-field w-full"
                  />
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
