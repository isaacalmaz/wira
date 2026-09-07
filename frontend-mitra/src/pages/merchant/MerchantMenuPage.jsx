import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, GripVertical, Search, X, Check, UtensilsCrossed, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

const categories = [
  { id: 'all', name: 'Semua Menu' },
  { id: 'makanan', name: 'Makanan Utama' },
  { id: 'minuman', name: 'Minuman' },
  { id: 'snack', name: 'Camilan / Penutup' }
];

const MerchantMenuPage = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState([]);
  const [merchantId, setMerchantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('makanan');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');

  const fetchMenu = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Dapatkan ID Merchant dari owner_id
      const { data: mData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

      let targetMerchantId = mData?.id;
      if (!targetMerchantId) {
        // Fallback jika belum terikat owner_id, ambil merchant pertama
        const { data: firstM } = await supabase.from('merchants').select('id').limit(1).maybeSingle();
        targetMerchantId = firstM?.id;
      }

      setMerchantId(targetMerchantId);

      if (targetMerchantId) {
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .eq('merchant_id', targetMerchantId)
          .order('created_at', { ascending: false });

        if (products) {
          setMenuItems(products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            image: p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            isAvailable: p.is_available ?? true
          })));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, [user]);

  // Buka Modal Tambah
  const handleOpenAdd = () => {
    setEditingItem(null);
    setName('');
    setPrice('');
    setDescription('');
    setImage('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400');
    setIsModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price);
    setDescription(item.description || '');
    setImage(item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400');
    setIsModalOpen(true);
  };

  // Simpan Menu (Tambah / Update) ke Supabase
  const handleSaveMenu = async (e) => {
    e.preventDefault();
    if (!name || !price) {
      toast.error('Nama dan harga menu wajib diisi');
      return;
    }

    try {
      if (editingItem) {
        // Edit mode di Supabase
        const { error } = await supabase
          .from('products')
          .update({
            name,
            price: Number(price),
            description,
            image: image || editingItem.image,
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        toast.success(`Menu "${name}" berhasil diperbarui!`);
      } else {
        // Add mode di Supabase
        if (!merchantId) {
          toast.error('Restoran belum terdaftar di database.');
          return;
        }

        const { error } = await supabase
          .from('products')
          .insert([{
            merchant_id: merchantId,
            name,
            price: Number(price),
            description,
            image: image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            is_available: true
          }]);

        if (error) throw error;
        toast.success(`Menu baru "${name}" berhasil ditambahkan!`);
      }

      setIsModalOpen(false);
      fetchMenu();
    } catch (err) {
      toast.error('Gagal menyimpan menu: ' + err.message);
    }
  };

  // Hapus Menu dari Supabase
  const handleDelete = async (id, itemName) => {
    if (window.confirm(`Hapus menu "${itemName}" dari daftar restoran Anda?`)) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        toast.success(`Menu "${itemName}" telah dihapus`);
        fetchMenu();
      } catch (err) {
        toast.error('Gagal menghapus: ' + err.message);
      }
    }
  };

  // Toggle status habis / tersedia di Supabase
  const toggleStatus = async (id) => {
    const target = menuItems.find(m => m.id === id);
    if (!target) return;
    const newStatus = !target.isAvailable;

    try {
      await supabase.from('products').update({ is_available: newStatus }).eq('id', id);
      setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: newStatus } : m));
      toast(newStatus ? `Menu sekarang Tersedia` : `Menu ditandai Habis`, {
        icon: newStatus ? '✅' : '⏸️',
      });
    } catch (err) {
      toast.error('Gagal mengubah status');
    }
  };

  const filteredItems = menuItems.filter(
    (item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Manajemen Menu Makanan
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur hidangan, harga, foto, dan status ketersediaan di WiraFood
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-primary text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-opacity-90 shadow-sm transition"
        >
          <Plus size={18} /> <span>Tambah Menu Baru</span>
        </button>
      </div>

      {/* Kategori Tabs */}
      <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all ${
              activeCategory === cat.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Pencarian */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Cari nama menu hidangan..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:outline-none text-xs sm:text-sm"
        />
      </div>

      {/* Daftar Menu */}
      <div className="space-y-3">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex gap-4 items-center transition hover:shadow-md"
            >
              <img
                src={item.image}
                alt={item.name}
                className="w-20 h-20 rounded-xl object-cover bg-slate-100 shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">
                    {item.name}
                  </h3>
                  <span className="font-extrabold text-sm text-primary whitespace-nowrap ml-2">
                    Rp {item.price.toLocaleString('id-ID')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                  {item.description}
                </p>

                <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStatus(item.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        item.isAvailable ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          item.isAvailable ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span
                      className={`text-xs font-bold ${
                        item.isAvailable ? 'text-green-600' : 'text-slate-400'
                      }`}
                    >
                      {item.isAvailable ? 'Tersedia' : 'Habis'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-2 text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 transition-colors"
                      title="Edit Menu"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="p-2 text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg hover:bg-red-100 transition-colors"
                      title="Hapus Menu"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <UtensilsCrossed size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">Tidak ada menu di kategori ini.</p>
            <button
              onClick={handleOpenAdd}
              className="mt-3 text-xs font-bold text-primary hover:underline"
            >
              + Tambah Menu Baru Sekarang
            </button>
          </div>
        )}
      </div>

      {/* MODAL TAMBAH / EDIT MENU */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingItem ? 'Edit Menu Hidangan' : 'Tambah Menu Baru'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Isi rincian makanan atau minuman yang ingin dijual
              </p>
            </div>

            <form onSubmit={handleSaveMenu} className="space-y-3 text-left">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Menu
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Sate Rembiga Pedas Manis"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Harga (Rp)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    placeholder="Contoh: 35000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs font-bold dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {categories
                      .filter((c) => c.id !== 'all')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Deskripsi Menu
                </label>
                <textarea
                  placeholder="Bumbu khas rembiga disajikan dengan lontong dan sambal..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  rows="2"
                ></textarea>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  URL Foto Makanan
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md hover:bg-opacity-90"
                >
                  {editingItem ? 'Simpan Perubahan' : 'Tambah Menu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MerchantMenuPage;
