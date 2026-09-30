import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Car, Store, Home, Wrench, Bike } from 'lucide-react';
import { Button, Card, Field, Input, Textarea, Segmented, cx } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { submitMitraApplication } from '../services/mitraApplicationService';

// Mirrors RegisterPage.jsx's DEFAULT_JOB_PREFS_BY_VEHICLE exactly - this form
// duplicates RegisterPage's driver-upgrade logic (see file header rationale
// there), so the same vehicle_type -> job_type_preferences defaults must stay
// in sync: mobil never gets 'food' as an option at all (hard restriction, not
// a toggle - see migrations/0033).
const DEFAULT_JOB_PREFS_BY_VEHICLE = {
  motor: ['ride', 'send', 'food'],
  mobil: ['ride', 'send'],
};

// ---- display-only helpers (markup only) ----
const Brand = () => (
  <div className="flex items-center gap-2.5" aria-hidden="true">
    <WiraMark size={34} />
    <span className="flex items-baseline gap-1.5 leading-none">
      <span className="text-[24px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
      <span className="text-[18px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
    </span>
  </div>
);

const CheckRow = ({ checked, onChange, children }) => (
  <label
    className={cx(
      'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2.5 transition-colors',
      checked ? 'border-brand-line bg-brand-soft' : 'border-line-strong bg-card hover:bg-sunken',
    )}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-5 w-5 shrink-0 rounded-[6px] border-line-strong bg-card text-brand focus:ring-2 focus:ring-brand/30 focus:ring-offset-0"
    />
    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{children}</span>
  </label>
);

const ROLE_OPTIONS = [
  { value: 'driver', label: 'Driver', icon: Car },
  { value: 'merchant', label: 'Restoran', icon: Store },
  { value: 'villa', label: 'Villa', icon: Home },
  { value: 'technician', label: 'Teknisi', icon: Wrench },
].map(({ value, label, icon: Icon }) => ({
  value,
  label: (
    <span className="inline-flex items-center justify-center gap-2">
      <Icon size={16} aria-hidden="true" /> {label}
    </span>
  ),
}));

const UnauthorizedPage = () => {
  const { user, logout } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [role, setRole] = useState('driver');
  const [formData, setFormData] = useState({
    vehicle: '', plate: '', vehicleType: 'motor', jobTypePreferences: DEFAULT_JOB_PREFS_BY_VEHICLE.motor,
    simPhoto: null, restaurantName: '', address: '', specialization: '', experience: ''
  });
  const [loading, setLoading] = useState(false);

  // Switching vehicle type resets job-type preferences to that vehicle's
  // sensible default, same as RegisterPage.jsx's handleVehicleTypeChange -
  // 'food' must never stay selectable for a mobil driver.
  const handleVehicleTypeChange = (vehicleType) => {
    setFormData((prev) => ({ ...prev, vehicleType, jobTypePreferences: DEFAULT_JOB_PREFS_BY_VEHICLE[vehicleType] }));
  };

  const toggleJobTypePreference = (jobType) => {
    setFormData((prev) => {
      const has = prev.jobTypePreferences.includes(jobType);
      return {
        ...prev,
        jobTypePreferences: has
          ? prev.jobTypePreferences.filter((t) => t !== jobType)
          : [...prev.jobTypePreferences, jobType],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const application = {
      role: role,
      name: user.name || user.email,
      phone: user.phone || '',
      email: user.email,
      vehicle: role === 'driver' ? formData.vehicle : null,
      plate: role === 'driver' ? formData.plate : null,
      // Previously missing entirely - DriverHomePage.jsx blocks going online
      // until vehicle_type is set, so a driver upgraded through this path
      // (without RegisterPage.jsx's step 3) got approved into a dead end.
      vehicle_type: role === 'driver' ? formData.vehicleType : null,
      job_type_preferences: role === 'driver' ? formData.jobTypePreferences : null,
      sim_photo: formData.simPhoto || null,
      restaurant_name: (role === 'merchant' || role === 'villa') ? formData.restaurantName : null,
      address: (role === 'merchant' || role === 'villa') ? formData.address : null,
      service_type: role === 'merchant' ? 'food' : role === 'villa' ? 'villa' : null,
      specialization: role === 'technician' ? formData.specialization : null,
      experience: role === 'technician' ? formData.experience : null,
    };

    try {
      await submitMitraApplication(supabase, application, user.id);

      // Update public.users status to Pending
      const { error: userErr, data: userData } = await supabase.from('users').update({ status: 'Pending' }).eq('id', user.id).select();
      if (userErr) throw userErr;
      if (!userData || userData.length === 0) throw new Error('Gagal memperbarui status akun (akses ditolak).');

      toast.success('Pendaftaran mitra berhasil dikirim! Silakan tunggu persetujuan Admin.');
      window.location.reload(); // Reload to trigger routing to pending-verification
    } catch (err) {
      toast.error('Gagal mengirim pendaftaran: ' + err.message);
    }
    setLoading(false);
  };

  if (showUpgrade) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center gap-6 bg-ground px-4 py-8 sm:justify-center sm:py-12">
        <Brand />
        <Card padding="none" className="w-full max-w-lg overflow-hidden">
          <div className="h-1.5 tenun-band" aria-hidden="true" />
          <div className="flex flex-col gap-6 p-5 sm:p-7">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">Daftar Menjadi Mitra</h1>

            <Segmented
              ariaLabel="Jenis Mitra"
              options={ROLE_OPTIONS}
              value={role}
              onChange={setRole}
              className="grid w-full grid-cols-2"
            />

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {role === 'driver' && (
                <>
                  <Field label="Kendaraan (Merek & Tipe)" htmlFor="up-vehicle" required>
                    <Input id="up-vehicle" required type="text" placeholder="Honda Vario 150" value={formData.vehicle} onChange={e => setFormData({...formData, vehicle: e.target.value})} />
                  </Field>
                  <Field label="Plat Nomor" htmlFor="up-plate" required>
                    <Input id="up-plate" required type="text" className="font-mono uppercase" placeholder="DR 1234 AB" value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value})} />
                  </Field>

                  {/* Kategori kendaraan - menentukan layanan apa saja yang bisa
                      dipilih di bawah (mobil tidak pernah bisa Antar Makanan).
                      Sama seperti RegisterPage.jsx langkah 3, wajib diisi di
                      sini juga agar driver yang upgrade lewat form ini tidak
                      terjebak tanpa vehicle_type (lihat DriverHomePage.jsx). */}
                  <fieldset className="flex flex-col">
                    <legend className="mb-1.5 text-[13px] font-semibold text-ink">Kategori Kendaraan</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'motor', label: 'Motor', icon: Bike },
                        { id: 'mobil', label: 'Mobil', icon: Car },
                      ].map((v) => {
                        const checked = formData.vehicleType === v.id;
                        return (
                          <label
                            key={v.id}
                            className={cx(
                              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 py-2.5 text-sm font-semibold text-ink transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40',
                              checked ? 'border-brand bg-brand-soft' : 'border-line-strong bg-card hover:bg-sunken',
                            )}
                          >
                            <input
                              type="radio"
                              name="vehicleType"
                              value={v.id}
                              checked={checked}
                              onChange={() => handleVehicleTypeChange(v.id)}
                              className="sr-only"
                            />
                            <v.icon size={18} className={checked ? 'text-brand-ink' : 'text-ink-muted'} aria-hidden="true" />
                            {v.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Preferensi layanan - Antar Makanan tidak pernah muncul
                      untuk mobil, sama seperti RegisterPage.jsx. */}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1.5 text-[13px] font-semibold text-ink">Layanan yang Ingin Diterima</legend>
                    <CheckRow checked={formData.jobTypePreferences.includes('ride')} onChange={() => toggleJobTypePreference('ride')}>
                      Ride (Antar Penumpang)
                    </CheckRow>
                    <CheckRow checked={formData.jobTypePreferences.includes('send')} onChange={() => toggleJobTypePreference('send')}>
                      Kurir (Antar Barang){formData.vehicleType === 'mobil' ? ' - khusus paket sedang/besar' : ''}
                    </CheckRow>
                    {formData.vehicleType !== 'mobil' && (
                      <CheckRow checked={formData.jobTypePreferences.includes('food')} onChange={() => toggleJobTypePreference('food')}>
                        Antar Makanan (WiraFood)
                      </CheckRow>
                    )}
                  </fieldset>
                </>
              )}

              {(role === 'merchant' || role === 'villa') && (
                <>
                  <Field label={role === 'villa' ? 'Nama Villa/Penginapan' : 'Nama Toko/Restoran'} htmlFor="up-restaurant" required>
                    <Input id="up-restaurant" required type="text" placeholder={role === 'villa' ? 'Villa Senggigi Sunset' : 'Warung Nasi Wira'} value={formData.restaurantName} onChange={e => setFormData({...formData, restaurantName: e.target.value})} />
                  </Field>
                  <Field label="Alamat Lengkap" htmlFor="up-address" required>
                    <Textarea id="up-address" required placeholder="Jl. Raya Wira No. 1" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                  </Field>
                </>
              )}

              {role === 'technician' && (
                <>
                  <Field label="Spesialisasi" htmlFor="up-specialization" required>
                    <Input id="up-specialization" required type="text" placeholder="AC, Kulkas, Mesin Cuci" value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} />
                  </Field>
                  <Field label="Pengalaman (Tahun)" htmlFor="up-experience" required>
                    <Input id="up-experience" required type="number" inputMode="numeric" className="font-mono" placeholder="2" value={formData.experience} onChange={e => setFormData({...formData, experience: e.target.value})} />
                  </Field>
                </>
              )}

              <div className="mt-2 flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row">
                <Button type="button" variant="secondary" size="lg" className="sm:w-1/3" onClick={() => setShowUpgrade(false)}>Batal</Button>
                <Button type="submit" size="lg" className="sm:flex-1" isLoading={loading}>
                  {loading ? 'Mengirim...' : 'Kirim Pendaftaran'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <Brand />
      <Card padding="none" className="w-full max-w-[420px] overflow-hidden">
        <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-7">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-tile border border-danger-line bg-danger-soft text-danger">
            <LogOut size={26} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">Akses Ditolak</h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              Akun Anda belum terdaftar sebagai Mitra Wira (Driver, Restoran, Villa, atau Teknisi).
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5 border-t border-line pt-5">
            <p className="text-[13px] font-semibold text-ink-muted">Ingin bergabung menjadi Mitra?</p>
            <Button size="lg" block onClick={() => setShowUpgrade(true)}>
              Daftar Menjadi Mitra
            </Button>
            <Button variant="secondary" size="lg" block onClick={logout}>
              Ganti Akun
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
export default UnauthorizedPage;
