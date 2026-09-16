import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/shared/UIComponents';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { toast } from 'react-hot-toast';
import { User, Phone, Save, ChevronLeft, Moon, Camera, Store, Car, Package, Utensils, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { uploadImageToBucket } from '../../utils/imageUpload';

const SettingsPage = () => {
  const { user, mitraAccess, refreshProfile } = useAuth();
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

  // Driver is now one unified portal (Ride/Kurir/Makanan) instead of two
  // separate logins - a driver picks which job types they want here,
  // constrained by their vehicle type, rather than the app assigning access
  // via mitra_access role tags (see migrations/0033). vehicle_type is
  // required before a driver can go online (enforced in DriverHomePage.jsx),
  // since which job types are even selectable depends on it.
  const isDriver = !!mitraAccess?.includes('driver');
  const [vehicleType, setVehicleType] = useState('motor');
  const [jobTypePrefs, setJobTypePrefs] = useState([]);
  const [isSavingDriverPrefs, setIsSavingDriverPrefs] = useState(false);

  useEffect(() => {
    if (!isDriver || !user) return;
    setVehicleType(user.vehicle_type || 'motor');
    setJobTypePrefs(Array.isArray(user.job_type_preferences) ? user.job_type_preferences : []);
  }, [isDriver, user]);

  const handleVehicleTypeChange = (nextType) => {
    setVehicleType(nextType);
    if (nextType === 'mobil') {
      // Antar Makanan is a hard restriction for mobil, not a toggle - strip
      // it immediately rather than leaving a stale selection the UI no
      // longer even shows a control for.
      setJobTypePrefs((prev) => prev.filter((t) => t !== 'food'));
    }
  };

  const toggleJobTypePreference = (jobType) => {
    setJobTypePrefs((prev) => (prev.includes(jobType) ? prev.filter((t) => t !== jobType) : [...prev, jobType]));
  };

  const handleSaveDriverPrefs = async () => {
    if (!user) return;
    setIsSavingDriverPrefs(true);
    try {
      const finalPrefs = vehicleType === 'mobil' ? jobTypePrefs.filter((t) => t !== 'food') : jobTypePrefs;
      // RLS trap (see AGENTS.md): an update blocked by RLS returns
      // error:null with 0 rows, which looks like success unless the
      // response array length is checked.
      const { error, data } = await supabase
        .from('users')
        .update({ vehicle_type: vehicleType, job_type_preferences: finalPrefs })
        .eq('id', user.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau akun tidak ditemukan.');

      toast.success('Preferensi layanan berhasil disimpan!');
      // vehicle_type/job_type_preferences live on AuthContext's user object -
      // a plain DB write here doesn't refresh it on its own. refreshProfile()
      // re-fetches it in place (no full page reload, same helper
      // DriverHomePage.jsx's quick-toggle widget uses).
      await refreshProfile();
    } catch (err) {
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setIsSavingDriverPrefs(false);
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

      {isDriver && (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-bold text-base">Preferensi Layanan Driver</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pilih kategori kendaraan dan layanan yang ingin Anda terima.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Kategori Kendaraan</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'motor', label: 'Motor' }, { id: 'mobil', label: 'Mobil' }].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleVehicleTypeChange(v.id)}
                  className={`p-3 border rounded-xl text-center font-semibold text-sm transition-all ${
                    vehicleType === v.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary dark:border-primary text-primary'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {!user?.vehicle_type && (
              <p className="text-[11px] text-amber-600 mt-1.5 font-medium">
                Wajib dipilih dan disimpan sebelum Anda bisa mulai Online.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Layanan yang Diterima</label>

            <label className="flex items-center justify-between gap-3 p-3 border rounded-xl border-slate-200 dark:border-slate-700 cursor-pointer">
              <span className="flex items-center gap-2.5">
                <Car size={18} className="text-blue-600 shrink-0" />
                <span className="text-sm font-medium">Ride (Antar Penumpang)</span>
              </span>
              <input type="checkbox" className="w-4 h-4" checked={jobTypePrefs.includes('ride')} onChange={() => toggleJobTypePreference('ride')} />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 border rounded-xl border-slate-200 dark:border-slate-700 cursor-pointer">
              <span className="flex items-center gap-2.5">
                <Package size={18} className="text-rose-600 shrink-0" />
                <span className="text-sm font-medium">
                  Kurir (Antar Barang)
                  {vehicleType === 'mobil' && <span className="block text-[11px] font-normal text-slate-400">Khusus paket sedang &amp; besar</span>}
                </span>
              </span>
              <input type="checkbox" className="w-4 h-4" checked={jobTypePrefs.includes('send')} onChange={() => toggleJobTypePreference('send')} />
            </label>

            {vehicleType === 'mobil' ? (
              <p className="text-[11px] text-slate-400 px-1">
                Antar Makanan tidak tersedia untuk kendaraan Mobil.
              </p>
            ) : (
              <label className="flex items-center justify-between gap-3 p-3 border rounded-xl border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="flex items-center gap-2.5">
                  <Utensils size={18} className="text-amber-600 shrink-0" />
                  <span className="text-sm font-medium">Antar Makanan (WiraFood)</span>
                </span>
                <input type="checkbox" className="w-4 h-4" checked={jobTypePrefs.includes('food')} onChange={() => toggleJobTypePreference('food')} />
              </label>
            )}
          </div>

          <Button
            variant="primary"
            className="w-full flex items-center justify-center gap-1.5 text-sm py-2.5"
            onClick={handleSaveDriverPrefs}
            disabled={isSavingDriverPrefs}
          >
            {isSavingDriverPrefs ? <Loader2 size={14} className="animate-spin" /> : <Save size={16} />}
            Simpan Preferensi
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
