import { useState, useEffect } from 'react';
import { Badge, Button, Card, Field, IconTile, Input, ListRow, PageHeader, cx } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { toast } from 'react-hot-toast';
import { User, Phone, Save, Moon, Camera, Store, Car, Package, Utensils, MessageSquare, Bike, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { uploadImageToBucket } from '../../utils/imageUpload';
import useMyMerchants from '../../hooks/useMyMerchants';
import DeleteAccountSheet from '../../components/account/DeleteAccountSheet';

// ---- display-only helpers ----
const uploadBtnCls = 'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-card px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';

const PrefRow = ({ icon: Icon, checked, onChange, children }) => (
  <label
    className={cx(
      'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-3 transition-colors',
      checked ? 'border-brand-line bg-brand-soft' : 'border-line-strong bg-card hover:bg-sunken',
    )}
  >
    <Icon size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{children}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-5 w-5 shrink-0 rounded-[6px] border-line-strong bg-card text-brand focus:ring-2 focus:ring-brand/30 focus:ring-offset-0"
    />
  </label>
);

const SettingsPage = () => {
  const { user, mitraAccess, refreshProfile } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  // The business photo belongs to the first property of the portal this page
  // is opened from; .maybeSingle() used to fail for owners of several villas.
  const { merchants } = useMyMerchants();
  useEffect(() => {
    if (hasBusiness) setMerchant(merchants[0] || null);
  }, [hasBusiness, merchants]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingAvatar(true);
    try {
      const url = await uploadImageToBucket(supabase, 'menu-images', user.id, file);
      const { error, data } = await supabase.from('users').update({ avatar_url: url }).eq('id', user.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau profil tidak ditemukan.');
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
      const { error, data } = await supabase.from('merchants').update({ image: url }).eq('id', merchant.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data usaha tidak ditemukan.');
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Pengaturan Akun" back className="mb-0" />

      <Card className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-sunken">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Foto Profil" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-muted"><User size={32} /></div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <p className="truncate text-[15px] font-bold text-ink max-w-full">{formData.name || user?.name}</p>
          <label className={uploadBtnCls}>
            <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarSelect} disabled={isUploadingAvatar} />
            <Camera size={16} className="shrink-0" aria-hidden="true" />
            {isUploadingAvatar ? 'Mengunggah...' : 'Ganti Foto Profil'}
          </label>
        </div>
      </Card>

      {hasBusiness && merchant && (
        <Card className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-tile border border-line bg-sunken">
            {merchant.image ? (
              <img src={merchant.image} alt="Logo Usaha" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-muted"><Store size={32} /></div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <label className={uploadBtnCls}>
              <input type="file" accept="image/*" className="sr-only" onChange={handleLogoSelect} disabled={isUploadingLogo} />
              <Camera size={16} className="shrink-0" aria-hidden="true" />
              {isUploadingLogo ? 'Mengunggah...' : 'Ganti Logo / Foto Usaha'}
            </label>
            <p className="text-xs leading-relaxed text-ink-muted">Ditampilkan ke pelanggan yang melihat toko/villa Anda.</p>
          </div>
        </Card>
      )}

      {isDriver && (
        <Card padding="lg" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Preferensi Layanan Driver</h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">Pilih kategori kendaraan dan layanan yang ingin Anda terima.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink">Kategori Kendaraan</span>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'motor', label: 'Motor', icon: Bike }, { id: 'mobil', label: 'Mobil', icon: Car }].map((v) => {
                const active = vehicleType === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleVehicleTypeChange(v.id)}
                    className={cx(
                      'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-3 py-2.5 text-sm font-semibold transition-colors',
                      active ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    <v.icon size={18} aria-hidden="true" />
                    {v.label}
                  </button>
                );
              })}
            </div>
            {!user?.vehicle_type && (
              <p className="text-xs font-medium text-warning-ink">
                Wajib dipilih dan disimpan sebelum Anda bisa mulai Online.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink">Layanan yang Diterima</span>

            <PrefRow icon={Car} checked={jobTypePrefs.includes('ride')} onChange={() => toggleJobTypePreference('ride')}>
              Ride (Antar Penumpang)
            </PrefRow>

            <PrefRow icon={Package} checked={jobTypePrefs.includes('send')} onChange={() => toggleJobTypePreference('send')}>
              Kurir (Antar Barang)
              {vehicleType === 'mobil' && <span className="block text-xs font-normal text-ink-muted">Khusus paket sedang &amp; besar</span>}
            </PrefRow>

            {vehicleType === 'mobil' ? (
              <p className="px-1 text-xs text-ink-muted">
                Antar Makanan tidak tersedia untuk kendaraan Mobil.
              </p>
            ) : (
              <PrefRow icon={Utensils} checked={jobTypePrefs.includes('food')} onChange={() => toggleJobTypePreference('food')}>
                Antar Makanan (WiraFood)
              </PrefRow>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            block
            onClick={handleSaveDriverPrefs}
            isLoading={isSavingDriverPrefs}
            leftIcon={<Save size={18} />}
          >
            Simpan Preferensi
          </Button>
        </Card>
      )}

      <Card padding="lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nama Lengkap" htmlFor="settings-name">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"><User size={18} /></span>
              <Input
                id="settings-name"
                type="text"
                name="name"
                autoComplete="name"
                value={formData.name}
                onChange={handleChange}
                className="pl-11"
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>
          </Field>

          <Field label="Nomor Telepon" htmlFor="settings-phone" hint="Gunakan format internasional (misal: +62)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"><Phone size={18} /></span>
              <Input
                id="settings-phone"
                type="tel"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={handleChange}
                className="pl-11 font-mono"
                placeholder="+62 8..."
                required
              />
            </div>
          </Field>

          <Button type="submit" variant="primary" size="lg" block className="mt-2" isLoading={loading} leftIcon={<Save size={18} />}>
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <ListRow
          as={Link}
          to="../support"
          className="min-h-11 px-4 py-3.5"
          leading={<IconTile tone="brand" size="sm"><MessageSquare size={18} /></IconTile>}
          title="Pusat Bantuan & Komplain"
          trailing={<Badge tone="brand">Baru</Badge>}
          chevron
        />
        <ListRow
          as="a"
          href="https://wira.one/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 border-t border-line px-4 py-3.5"
          leading={<IconTile tone="brand" size="sm"><ShieldCheck size={18} /></IconTile>}
          title="Kebijakan Privasi"
          chevron
        />
      </Card>

      <Card className="flex items-center gap-3">
        <IconTile tone="neutral" size="sm"><Moon size={18} /></IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[14px] font-semibold text-ink">Mode Gelap</p>
          <p className="text-xs text-ink-muted">Lebih nyaman di mata saat malam</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!darkMode}
          onClick={toggleDarkMode}
          className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
        >
          <span className="sr-only">Aktifkan Mode Gelap</span>
          <span
            aria-hidden="true"
            className={cx(
              'relative inline-flex h-8 w-14 items-center rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand/40 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card',
              darkMode ? 'border-brand bg-brand' : 'border-line-strong bg-sunken',
            )}
          >
            <span
              className={cx(
                'inline-block h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform',
                darkMode ? 'translate-x-[27px]' : 'translate-x-[3px]',
              )}
            />
          </span>
        </button>
      </Card>

      {/* Penjelasan Arsitektur */}
      <Button variant="ghost" size="sm" className="self-center text-ink-muted" onClick={() => setDeleteOpen(true)}>Hapus Akun</Button>
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
};
export default SettingsPage;
