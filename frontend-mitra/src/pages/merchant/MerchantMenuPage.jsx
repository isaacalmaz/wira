import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, X, UtensilsCrossed, RefreshCw, Camera } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/shared/UIComponents';
import { uploadImageToBucket } from '../../utils/imageUpload';

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
  // True once fetchMenu has run for a logged-in user and found no
  // merchants row owned by them - distinct from merchantId simply being
  // null because we haven't checked yet (see fetchMenu).
  const [profileNotLinked, setProfileNotLinked] = useState(false);
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingImage(true);
    try {
      const url = await uploadImageToBucket(supabase, 'menu-images', user.id, file);
      setImage(url);
      toast.success('Foto berhasil diunggah');
    } catch (err) {
      toast.error('Gagal mengunggah foto: ' + err.message);
    } finally {
      setIsUploadingImage(false);
      e.target.value = null;
    }
  };

  const fetchMenu = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Dapatkan ID Merchant dari owner_id. Sebelumnya ada fallback yang
      // mengambil baris `merchants` PERTAMA di seluruh tabel bila owner_id
      // belum terikat (mis. saat akun masih menunggu persetujuan admin
      // setelah mendaftar - lihat RegisterPage.jsx, pendaftaran mitra masuk
      // ke `mitra_applications` dengan status 'Pending' dan
      // baris `merchants` baru dibuat belakangan, bukan saat itu juga) -
      // itu bisa diam-diam menempelkan akun mitra ini ke etalase toko orang
      // lain (menampilkan menu mereka, dan insert produk baru ke toko
      // mereka). Dihapus: bila belum terikat, tampilkan status error yang
      // jelas alih-alih fallback ke toko sembarang.
      const { data: mData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

      const targetMerchantId = mData?.id || null;
      setMerchantId(targetMerchantId);
      setProfileNotLinked(!targetMerchantId);

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
            category: p.category || 'makanan',
            isAvailable: p.is_available ?? true
          })));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat menu: ' + err.message);
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
    setCategory('makanan');
    setDescription('');
    setImage('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400');
    setIsModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price);
    setCategory(item.category || 'makanan');
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
        const { error, data } = await supabase
          .from('products')
          .update({
            name,
            price: Number(price),
            category,
            description,
            image: image || editingItem.image,
          })
          .eq('id', editingItem.id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak atau menu tidak ditemukan.');
        toast.success(`Menu "${name}" berhasil diperbarui!`);
      } else {
        // Add mode di Supabase
        if (!merchantId) {
          toast.error('Profil merchant Anda belum terdaftar/terhubung.');
          return;
        }

        const { error } = await supabase
          .from('products')
          .insert([{
            merchant_id: merchantId,
            name,
            price: Number(price),
            category,
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
        const { error, data } = await supabase.from('products').delete().eq('id', id).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Akses ditolak atau menu tidak ditemukan.');
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
      const { error, data } = await supabase.from('products').update({ is_available: newStatus }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau menu tidak ditemukan.');
      setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: newStatus } : m));
      toast(newStatus ? `Menu sekarang Tersedia` : `Menu ditandai Habis`, {
        icon: newStatus ? '✅' : '⏸️',
      });
    } catch (err) {
      toast.error('Gagal mengubah status');
    }
  };

  const filteredItems = menuItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (activeCategory === 'all' || item.category === activeCategory)
  );

  // Akun ini belum terikat ke baris `merchants` manapun (owner_id belum
  // diisi) - dulu di sini ada fallback diam-diam ke toko orang lain, lihat
  // komentar di fetchMenu. Tampilkan status yang jelas dan hentikan di sini
  // daripada merender menu/tombol tambah yang tidak seharusnya bisa dipakai.
  if (!loading && profileNotLinked) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-12">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          Manajemen Menu Makanan
        </h1>
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <UtensilsCrossed size={40} className="mx-auto text-slate-300 mb-3" />
          <h2 className="font-bold text-slate-700 dark:text-slate-200 mb-1">
            Profil Merchant Anda Belum Terdaftar
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Akun ini belum terhubung ke toko manapun. Jika Anda baru saja
            mendaftar, pendaftaran mitra masih menunggu persetujuan admin -
            silakan cek kembali nanti atau hubungi dukungan Wira jika ini
            berlangsung lebih dari 1x24 jam.
          </p>
          <button
            onClick={fetchMenu}
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
          >
            <RefreshCw size={14} /> Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

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
                <span className="inline-block text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1">
                  {categories.find((c) => c.id === item.category)?.name || item.category}
                </span>
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
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md p-6 space-y-4 relative">
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
                  Foto Makanan
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 shrink-0 border border-slate-200 dark:border-slate-600">
                    {image && <img src={image} alt="Pratinjau" className="w-full h-full object-cover" />}
                  </div>
                  <label className="flex-1 cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} disabled={isUploadingImage} />
                    <div className="flex items-center justify-center gap-2 p-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
                      <Camera size={16} />
                      {isUploadingImage ? 'Mengunggah...' : 'Pilih Foto dari Perangkat'}
                    </div>
                  </label>
                </div>
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
                  disabled={isUploadingImage}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md hover:bg-opacity-90 disabled:opacity-50"
                >
                  {editingItem ? 'Simpan Perubahan' : 'Tambah Menu'}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
};

export default MerchantMenuPage;
