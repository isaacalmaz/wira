import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, UtensilsCrossed, RefreshCw, Camera, Image as ImageIcon, CheckCircle2, PauseCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, Sheet, Field, Input, Select, Textarea, Badge, Money, PageHeader, EmptyState, Segmented, Spinner, cx } from '../../components/ui';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { friendlyError } from '../../utils/friendlyError';

const categories = [
  { id: 'all', name: 'Semua Menu' },
  { id: 'makanan', name: 'Makanan Utama' },
  { id: 'minuman', name: 'Minuman' },
  { id: 'snack', name: 'Camilan / Penutup' }
];

// Availability switch for a product row: 44px tap target; the Badge beside
// it carries the state in words, so it never relies on colour alone.
const AvailabilitySwitch = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className="-ml-1.5 inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full"
  >
    <span className={cx('relative h-7 w-12 rounded-full transition-colors duration-200', checked ? 'bg-success' : 'bg-line-strong')}>
      <span className={cx('absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform duration-200', checked ? 'translate-x-5' : 'translate-x-0')} />
    </span>
  </button>
);

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
  // Stable identity: Sheet re-runs its focus effect when onClose changes,
  // which would pull focus back to the first field on every keystroke.
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingImage(true);
    try {
      const url = await uploadImageToBucket(supabase, 'menu-images', user.id, file);
      setImage(url);
      toast.success('Foto berhasil diunggah');
    } catch (err) {
      toast.error('Gagal mengunggah foto: ' + friendlyError(err));
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
      // An owner may also run villas (migration 0097): the menu belongs to
      // their restaurant row, never to a villa.
      const { data: mData } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_id', user.id)
        .or('service_type.is.null,service_type.not.in.(villa,WiraVilla)')
        .order('created_at', { ascending: true })
        .limit(1)
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
      toast.error('Gagal memuat menu: ' + friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  // Re-fetch when these inputs change; the fetch function is recreated each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.error('Gagal menyimpan menu: ' + friendlyError(err));
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
        toast.error('Gagal menghapus: ' + friendlyError(err));
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
        icon: newStatus ? <CheckCircle2 size={18} className="text-success" /> : <PauseCircle size={18} className="text-ink-muted" />,
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
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
        <PageHeader title="Manajemen Menu Makanan" className="mb-0" />
        <EmptyState
          icon={<UtensilsCrossed size={24} />}
          title="Profil Merchant Anda Belum Terdaftar"
          description="Akun ini belum terhubung ke toko manapun. Jika Anda baru saja mendaftar, pendaftaran mitra masih menunggu persetujuan admin - silakan cek kembali nanti atau hubungi dukungan Wira jika ini berlangsung lebih dari 1x24 jam."
          action={
            <Button variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={fetchMenu}>
              Coba Muat Ulang
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-12">
      <PageHeader
        title="Manajemen Menu Makanan"
        subtitle="Atur hidangan, harga, foto, dan status ketersediaan di WiraFood"
        className="mb-0"
        actions={
          <Button
            variant="primary"
            onClick={handleOpenAdd}
            leftIcon={<Plus size={18} />}
            aria-label="Tambah Menu Baru"
            className="max-sm:w-11 max-sm:gap-0 max-sm:px-0"
          >
            <span className="hidden sm:inline">Tambah Menu Baru</span>
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        {/* Kategori Tabs */}
        <Segmented
          scroll
          ariaLabel="Kategori menu"
          options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
          value={activeCategory}
          onChange={setActiveCategory}
        />

        {/* Pencarian */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
          <Input
            type="search"
            placeholder="Cari nama menu hidangan..."
            aria-label="Cari nama menu hidangan"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Daftar Menu */}
      {loading && menuItems.length === 0 ? (
        <div className="flex justify-center py-12 text-brand-ink" role="status">
          <Spinner size={24} />
        </div>
      ) : filteredItems.length > 0 ? (
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          {filteredItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 p-3.5">
              <div className="flex gap-3.5">
                <img
                  src={item.image}
                  alt={item.name}
                  className={cx('h-20 w-20 shrink-0 rounded-control bg-sunken object-cover transition-opacity', !item.isAvailable && 'opacity-50 grayscale')}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="break-words text-[14px] font-semibold leading-snug text-ink">{item.name}</h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Money value={item.price} className="text-[14px] font-medium text-ink" />
                    <span className="text-line-strong" aria-hidden="true">·</span>
                    <span className="text-[12px] text-ink-muted">
                      {categories.find((c) => c.id === item.category)?.name || item.category}
                    </span>
                  </div>
                  {item.description && (
                    <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">{item.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AvailabilitySwitch
                  checked={item.isAvailable}
                  onChange={() => toggleStatus(item.id)}
                  label={`${item.name}: ${item.isAvailable ? 'Tersedia' : 'Habis'}`}
                />
                <Badge tone={item.isAvailable ? 'success' : 'neutral'}>{item.isAvailable ? 'Tersedia' : 'Habis'}</Badge>
                <span className="flex-1" />
                <Button
                  variant="secondary"
                  onClick={() => handleOpenEdit(item)}
                  title="Edit Menu"
                  aria-label={`Edit Menu ${item.name}`}
                  className="w-11 px-0"
                >
                  <Edit2 size={16} />
                </Button>
                <Button
                  variant="danger-soft"
                  onClick={() => handleDelete(item.id, item.name)}
                  title="Hapus Menu"
                  aria-label={`Hapus Menu ${item.name}`}
                  className="w-11 px-0"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<UtensilsCrossed size={24} />}
          title="Tidak ada menu di kategori ini."
          action={
            <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={handleOpenAdd}>
              Tambah Menu Baru Sekarang
            </Button>
          }
        />
      )}

      {/* MODAL TAMBAH / EDIT MENU */}
      <Sheet
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Edit Menu Hidangan' : 'Tambah Menu Baru'}
        description="Isi rincian makanan atau minuman yang ingin dijual"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              Batal
            </Button>
            <Button type="submit" form="menu-form" variant="primary" disabled={isUploadingImage}>
              {editingItem ? 'Simpan Perubahan' : 'Tambah Menu'}
            </Button>
          </>
        }
      >
        <form id="menu-form" onSubmit={handleSaveMenu} className="flex flex-col gap-4 text-left">
          <Field label="Nama Menu" htmlFor="menu-name" required>
            <Input
              id="menu-name"
              type="text"
              placeholder="Contoh: Sate Rembiga Pedas Manis"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <Field label="Harga (Rp)" htmlFor="menu-price" required>
              <Input
                id="menu-price"
                type="number"
                inputMode="numeric"
                min="1000"
                placeholder="Contoh: 35000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="font-mono"
                required
              />
            </Field>
            <Field label="Kategori" htmlFor="menu-category">
              <Select id="menu-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories
                  .filter((c) => c.id !== 'all')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>

          <Field label="Deskripsi Menu" htmlFor="menu-description">
            <Textarea
              id="menu-description"
              placeholder="Bumbu khas rembiga disajikan dengan lontong dan sambal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>

          <Field label="Foto Makanan" htmlFor="menu-image">
            <label
              htmlFor="menu-image"
              className={cx(
                'flex cursor-pointer items-center gap-3.5 rounded-control border border-dashed border-line-strong bg-card p-3 transition-colors',
                'hover:border-brand hover:bg-brand-soft/40 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20',
                isUploadingImage && 'pointer-events-none opacity-70',
              )}
            >
              <input
                id="menu-image"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleImageSelect}
                disabled={isUploadingImage}
              />
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-sunken text-ink-muted">
                {image ? (
                  <img src={image} alt="Pratinjau" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={22} aria-hidden="true" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-brand-ink">
                {isUploadingImage ? <Spinner size={16} className="shrink-0" /> : <Camera size={18} className="shrink-0" aria-hidden="true" />}
                <span className="min-w-0">{isUploadingImage ? 'Mengunggah...' : 'Pilih Foto dari Perangkat'}</span>
              </span>
            </label>
          </Field>
        </form>
      </Sheet>
    </div>
  );
};

export default MerchantMenuPage;
