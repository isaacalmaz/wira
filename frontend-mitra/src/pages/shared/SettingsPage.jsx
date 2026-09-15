import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/shared/UIComponents';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { toast } from 'react-hot-toast';
import { User, Phone, Save, ChevronLeft, Moon, Camera, Store, Car, Package, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { uploadImageToBucket } from '../../utils/imageUpload';

const SettingsPage = () => {
  const { user, mitraAccess } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
  });

  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const hasBusiness = mitraAccess?.includes('merchant') || mitraAccess?.includes('villa');
  const [merchant, setMerchant] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // A single real driver with one motorbike can legitimately do both ride
  // and delivery jobs - unlike Restoran/Villa, this isn't mutually
  // exclusive. Someone who registered for only one of Driver/Kurir can
  // self-activate the other here without a second admin review (they're
  // already a vetted mitra) - see migrations/0031's header for the full
  // rationale. Only offered when they hold exactly one of the two.
  const hasDriver = !!mitraAccess?.includes('driver');
  const hasCourier = !!mitraAccess?.includes('courier');
  const missingDualRole = hasDriver && !hasCourier ? 'courier' : (hasCourier && !hasDriver ? 'driver' : null);
  const [isActivatingDual, setIsActivatingDual] = useState(false);

  const handleActivateDualRole = async () => {
    if (!missingDualRole || !user) return;
    setIsActivatingDual(true);
    try {
      const currentAccess = Array.isArray(mitraAccess) ? mitraAccess : [];
      const nextAccess = [...currentAccess, missingDualRole];
      // RLS trap (see AGENTS.md): an update blocked by RLS returns
      // error:null with 0 rows, which looks like success unless the
      // response array length is checked.
      const { error, data } = await supabase
        .from('users')
        .update({ mitra_access: nextAccess })
        .eq('id', user.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau akun tidak ditemukan.');

      toast.success(
        missingDualRole === 'courier'
          ? 'Berhasil diaktifkan sebagai Kurir! Memuat ulang...'
          : 'Berhasil diaktifkan sebagai Driver! Memuat ulang...'
      );
      // mitraAccess lives in AuthContext state, populated from the session's
      // profile fetch - a plain DB write here doesn't refresh it on its own,
      // so reload to pick up the new role and unlock the /driver or
      // /courier route immediately instead of requiring a manual re-login.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(`Gagal mengaktifkan: ${err.message}`);
      setIsActivatingDual(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || ''
      });
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  useEffect(() => {
    if (!hasBusiness || !user) return;
    supabase.from('merchants').select('id, image').eq('owner_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setMerchant(data); });
  }, [hasBusiness, user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingAvatar(true);
    try {
      const url = await uploadImageToBucket(supabase, 'menu-images', user.id, file);
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;
      setAvatarUrl(url);
      toast.success('Foto profil berhasil diperbarui');
    } catch (err) {
      toast.error('Gagal mengunggah foto: ' + err.message);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = null;
    }
  };

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !merchant) return;
    setIsUploadingLogo(true);
    try {
      const url = await uploadImageToBucket(supabase, 'menu-images', user.id, file);
      const { error } = await supabase.from('merchants').update({ image: url }).eq('id', merchant.id);
      if (error) throw error;
      setMerchant((prev) => ({ ...prev, image: url }));
      toast.success('Logo usaha berhasil diperbarui');
    } catch (err) {
      toast.error('Gagal mengunggah logo: ' + err.message);
    } finally {
      setIsUploadingLogo(false);
      e.target.value = null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error, data } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone
        })
        .eq('id', user.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau akun tidak ditemukan.');
      toast.success('Profil berhasil diperbarui!');
    } catch (error) {
      toast.error(`Gagal menyimpan: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">Pengaturan Akun</h1>
      </div>

      <Card className="p-6 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 mb-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Foto Profil" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={36} /></div>
          )}
        </div>
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} disabled={isUploadingAvatar} />
          <div className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
            <Camera size={16} />
            {isUploadingAvatar ? 'Mengunggah...' : 'Ganti Foto Profil'}
          </div>
        </label>
      </Card>

      {hasBusiness && merchant && (
        <Card className="p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 mb-3">
            {merchant.image ? (
              <img src={merchant.image} alt="Logo Usaha" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400"><Store size={36} /></div>
            )}
          </div>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} disabled={isUploadingLogo} />
            <div className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
              <Camera size={16} />
              {isUploadingLogo ? 'Mengunggah...' : 'Ganti Logo / Foto Usaha'}
            </div>
          </label>
          <p className="text-[11px] text-slate-400 mt-2">Ditampilkan ke pelanggan yang melihat toko/villa Anda.</p>
        </Card>
      )}

      {missingDualRole && (
        <Card className="p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {missingDualRole === 'courier' ? <Package size={22} /> : <Car size={22} />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {missingDualRole === 'courier' ? 'Terima juga pesanan Kurir?' : 'Terima juga pesanan Driver?'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {missingDualRole === 'courier'
                ? 'Aktifkan untuk mulai menerima antar barang (Send) dengan kendaraan yang sama, tanpa perlu verifikasi ulang.'
                : 'Aktifkan untuk mulai menerima antar penumpang (Ride) dengan kendaraan yang sama, tanpa perlu verifikasi ulang.'}
            </p>
          </div>
          <Button
            variant="primary"
            className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2"
            onClick={handleActivateDualRole}
            disabled={isActivatingDual}
          >
            {isActivatingDual ? <Loader2 size={14} className="animate-spin" /> : null}
            {missingDualRole === 'courier' ? 'Aktifkan Kurir' : 'Aktifkan Driver'}
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Lengkap</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nomor Telepon</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={18} /></span>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="+62 8..."
                required
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Gunakan format internasional (misal: +62)</p>
          </div>

          <Button type="submit" variant="primary" className="w-full py-3 mt-4 flex items-center justify-center gap-2" disabled={loading}>
            <Save size={18} />
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon className="text-slate-400" size={20} />
          <div>
            <p className="font-semibold text-sm">Mode Gelap</p>
            <p className="text-xs text-slate-500">Lebih nyaman di mata saat malam</p>
          </div>
        </div>
        <button
          onClick={toggleDarkMode}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none shadow-inner shrink-0 ${
            darkMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span className="sr-only">Aktifkan Mode Gelap</span>
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
              darkMode ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </Card>

      {/* Penjelasan Arsitektur */}
      <div className="text-center text-sm text-slate-500 pt-4">
        <p>Halaman ini dikelola secara dinamis via session (JWT)</p>
        <p>Bukan menggunakan parameter URL Publik (seperti /driver/:id)</p>
      </div>
    </div>
  );
};
export default SettingsPage;
