import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Car, Store, Home, Wrench, Camera, CheckCircle2, Bike } from 'lucide-react';
import { Button, Card, Field, Input, Select, Textarea, IconTile, cx } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { submitMitraApplication } from '../services/mitraApplicationService';

// Kompres gambar otomatis agar ringan di cloud Supabase
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const ROLE_LABEL = { driver: 'Driver (Ride/Kurir/Makanan)', merchant: 'Restoran / Warung', villa: 'Villa / Penginapan', technician: 'Teknisi & Jasa' };

// Sensible defaults per vehicle type - motor can do all three job types,
// mobil never sees 'food' as an option at all (hard restriction, not a
// toggle - see migrations/0033), so its default preference set omits it.
const DEFAULT_JOB_PREFS_BY_VEHICLE = {
  motor: ['ride', 'send', 'food'],
  mobil: ['ride', 'send'],
};

// ---- display-only helpers (markup only, no state of their own) ----
const ROLE_ICON = { driver: Car, merchant: Store, villa: Home, technician: Wrench };

// A selectable card wrapping a visually hidden radio, so it stays keyboard
// reachable (the old `hidden` input was not).
const ChoiceCard = ({ checked, className = '', children, ...inputProps }) => (
  <label
    className={cx(
      'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40',
      checked ? 'border-brand bg-brand-soft' : 'border-line-strong bg-card hover:bg-sunken',
      className,
    )}
  >
    <input type="radio" checked={checked} className="sr-only" {...inputProps} />
    {children}
  </label>
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

const SummaryRow = ({ label, children }) => (
  <div className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
    <span className="w-28 shrink-0 text-[13px] text-ink-muted">{label}</span>
    <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold text-ink">{children}</span>
  </div>
);

const RegisterPage = () => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('driver');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    vehicle: '',
    plate: '',
    vehicleType: 'motor',
    jobTypePreferences: DEFAULT_JOB_PREFS_BY_VEHICLE.motor,
    restaurantName: '',
    address: '',
    specialization: 'AC & Pendingin', // must match an <option> value below (ServicePage matches on it)
    experience: '1',
    simPhoto: null,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVehicleTypeChange = (vehicleType) => {
    // Switching vehicle type resets job-type preferences to that vehicle's
    // sensible default, instead of leaving a stale 'food' selection checked
    // for a mobil driver who just switched from motor (food must never be
    // selectable for mobil at all - not just default-off).
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

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFormData((prev) => ({ ...prev, simPhoto: compressed }));
        toast.success('Foto dokumen berhasil dipilih & dikompres!', { icon: <Camera size={18} /> });
      } catch (err) {
        toast.error('Gagal memproses foto');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // KYC gate: the SIM/STNK file input is a hidden, custom-styled
    // <input type="file"> (see step 3 below) that only conditionally
    // renders a preview - a plain `required` attribute on a hidden input
    // either does nothing useful or throws "not focusable" and breaks the
    // step flow entirely, so this is enforced here instead, on the actual
    // submit handler that advances past step 3, not just via HTML.
    if (step === 3 && role === 'driver' && !formData.simPhoto) {
      toast.error('Unggah foto SIM & STNK terlebih dahulu untuk melanjutkan.');
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      setLoading(true);

      let authData;
      // 0. Buat akun di Supabase Auth
      try {
        const { data, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              phone: formData.phone,
              role: role
            }
          }
        });
        if (authError) throw authError;
        
        if (!data?.user?.id) {
          throw new Error("Email ini sudah terdaftar. Silakan gunakan email lain atau langsung Masuk (Login).");
        }
        
        authData = data;
      } catch (err) {
        toast.error(`Gagal mendaftar: ${err.message}`);
        setLoading(false);
        return;
      }

      const application = {
        role: role,
        name: formData.name,
        phone: formData.phone,
        vehicle: role === 'driver' ? formData.vehicle : null,
        plate: role === 'driver' ? formData.plate : null,
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
        await submitMitraApplication(supabase, { ...application, email: formData.email }, authData.user.id);
        toast.success('Pendaftaran berhasil dikirim!');
        navigate('/pending-verification');
      } catch (err) {
        console.error('Submit application error:', err);
        toast.error(`Akun dibuat, tetapi pendaftaran mitra gagal dikirim: ${err.message || 'Error tidak diketahui'}. Masuk (Login) lalu ajukan ulang.`);
      } finally {
        setLoading(false);
      }
    }
  };

  const step3Title = role === 'driver' ? 'Data Kendaraan' : role === 'merchant' ? 'Data Restoran / Warung' : role === 'villa' ? 'Data Villa / Penginapan' : 'Keahlian';
  const stepTitle = { 1: 'Pilih Jenis Mitra', 2: 'Data Pribadi', 3: step3Title, 4: 'Konfirmasi Pendaftaran' }[step];

  return (
    <div className="flex min-h-[100dvh] flex-col items-center gap-6 bg-ground px-4 py-8 sm:justify-center sm:py-12">
      <Link to="/login" className="flex items-center gap-2.5" aria-label="Wira Mitra">
        <WiraMark size={34} />
        <span className="flex items-baseline gap-1.5 leading-none" aria-hidden="true">
          <span className="text-[24px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
          <span className="text-[18px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
        </span>
      </Link>

      <Card padding="none" className="w-full max-w-lg overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          <div className="flex flex-col gap-4">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">Daftar Mitra Wira</h1>
            {/* Progress: 4 steps */}
            <div className="flex items-center gap-3">
              <ol className="flex flex-1 gap-1.5" aria-label={`${step}/4`}>
                {[1, 2, 3, 4].map((i) => (
                  <li
                    key={i}
                    aria-current={step === i ? 'step' : undefined}
                    className={cx('h-1.5 flex-1 rounded-full transition-colors', step >= i ? 'bg-brand' : 'bg-sunken')}
                  />
                ))}
              </ol>
              <span className="shrink-0 font-mono text-xs text-ink-muted">{step}/4</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <h2 className="-mb-2 text-[15px] font-bold tracking-tight text-ink">{stepTitle}</h2>

            {step === 1 && (
              <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Pilih Jenis Mitra">
                {[
                  { id: 'driver', title: 'Driver (Ride/Kurir/Makanan)', desc: 'Antar penumpang, paket, dan/atau makanan keliling Lombok - pilih layanan yang Anda mau di langkah berikutnya' },
                  { id: 'merchant', title: 'Restoran / Warung', desc: 'Jual makanan khas Lombok di WiraFood' },
                  { id: 'villa', title: 'Villa / Penginapan', desc: 'Sewakan properti di WiraVilla' },
                  { id: 'technician', title: 'Teknisi & Jasa', desc: 'Layanan AC, listrik, tukang, & kolam renang' },
                ].map((r) => {
                  const Icon = ROLE_ICON[r.id];
                  const checked = role === r.id;
                  return (
                    <ChoiceCard
                      key={r.id}
                      name="role"
                      value={r.id}
                      checked={checked}
                      onChange={() => setRole(r.id)}
                      className="items-start p-4"
                    >
                      <IconTile tone={checked ? 'brand' : 'neutral'} size="sm"><Icon size={18} /></IconTile>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-semibold text-ink">{r.title}</span>
                        <span className="text-[13px] leading-relaxed text-ink-muted">{r.desc}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={cx(
                          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                          checked ? 'border-brand' : 'border-line-strong',
                        )}
                      >
                        {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                      </span>
                    </ChoiceCard>
                  );
                })}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <Field label="Nama Lengkap" htmlFor="reg-name" required>
                  <Input
                    id="reg-name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </Field>
                <Field label="Nomor Handphone (WhatsApp)" htmlFor="reg-phone" required>
                  <Input
                    id="reg-phone"
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    inputMode="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="font-mono"
                    required
                  />
                </Field>
                <Field label="Alamat Email" htmlFor="reg-email" required>
                  <Input
                    id="reg-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </Field>
                <Field label="Kata Sandi" htmlFor="reg-password" hint="Minimal 6 karakter" required>
                  <Input
                    id="reg-password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                  />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                {role === 'driver' && (
                  <>
                    <Field label="Tipe Kendaraan" htmlFor="reg-vehicle" required>
                      <Input
                        id="reg-vehicle"
                        type="text"
                        name="vehicle"
                        value={formData.vehicle}
                        onChange={handleChange}
                        placeholder="cth: Honda Vario 160"
                        required
                      />
                    </Field>
                    <Field label="Plat Nomor" htmlFor="reg-plate" required>
                      <Input
                        id="reg-plate"
                        type="text"
                        name="plate"
                        value={formData.plate}
                        onChange={handleChange}
                        placeholder="cth: DR 1234 AB"
                        className="font-mono uppercase"
                        required
                      />
                    </Field>

                    {/* Kategori kendaraan - menentukan layanan apa saja yang
                        bisa dipilih di bawah (mobil tidak pernah bisa Antar
                        Makanan, dan Kurir untuk mobil hanya paket besar). */}
                    <fieldset className="flex flex-col gap-1.5">
                      <legend className="mb-1.5 text-[13px] font-semibold text-ink">Kategori Kendaraan</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'motor', label: 'Motor', icon: Bike },
                          { id: 'mobil', label: 'Mobil', icon: Car },
                        ].map((v) => (
                          <ChoiceCard
                            key={v.id}
                            name="vehicleType"
                            value={v.id}
                            checked={formData.vehicleType === v.id}
                            onChange={() => handleVehicleTypeChange(v.id)}
                            className="justify-center text-sm font-semibold text-ink"
                          >
                            <v.icon size={18} className={formData.vehicleType === v.id ? 'text-brand-ink' : 'text-ink-muted'} aria-hidden="true" />
                            {v.label}
                          </ChoiceCard>
                        ))}
                      </div>
                    </fieldset>

                    {/* Preferensi layanan - defaultnya sudah dicentang sesuai
                        kategori kendaraan, bisa diubah di sini atau nanti di
                        Pengaturan Akun. Antar Makanan tidak pernah muncul untuk
                        mobil - bukan sekadar default-off, tapi memang tidak
                        tersedia sama sekali (lihat migrations/0033). */}
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
                      <p className="text-xs text-ink-muted">Bisa diubah kapan saja lewat Pengaturan Akun setelah disetujui.</p>
                    </fieldset>

                    {/* Upload Foto SIM & STNK */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold text-ink">Foto SIM & STNK <span className="text-danger">*</span></span>
                      <input
                        type="file"
                        id="sim-upload"
                        accept="image/*"
                        className="peer sr-only"
                        onChange={handleFileUpload}
                      />
                      {formData.simPhoto ? (
                        <div className="flex items-center gap-3 rounded-control border border-success-line bg-success-soft p-3 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                          <img
                            src={formData.simPhoto}
                            alt="Preview SIM"
                            className="h-14 w-14 shrink-0 rounded-[10px] border border-line bg-sunken object-cover"
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-success-ink">
                              <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                              Foto SIM Berhasil Dipilih
                            </p>
                            <p className="text-xs text-ink-muted">Klik tombol di samping untuk mengganti</p>
                          </div>
                          <label
                            htmlFor="sim-upload"
                            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-control border border-line-strong bg-card px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken"
                          >
                            Ganti
                          </label>
                        </div>
                      ) : (
                        <label
                          htmlFor="sim-upload"
                          className="flex cursor-pointer flex-col items-center gap-2.5 rounded-card border-2 border-dashed border-line-strong bg-card px-5 py-7 text-center transition-colors hover:border-brand hover:bg-brand-soft peer-focus-visible:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30"
                        >
                          <IconTile tone="brand" size="md"><Camera size={20} /></IconTile>
                          <span className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-ink">Klik untuk Upload Foto SIM & STNK</span>
                            <span className="text-xs leading-relaxed text-ink-muted">
                              Mendukung format JPG, PNG, atau ambil langsung dari kamera HP
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                  </>
                )}
                {(role === 'merchant' || role === 'villa') && (
                  <>
                    <Field label={role === 'villa' ? 'Nama Villa / Penginapan' : 'Nama Restoran / Rumah Makan'} htmlFor="reg-restaurant" required>
                      <Input
                        id="reg-restaurant"
                        type="text"
                        name="restaurantName"
                        value={formData.restaurantName}
                        onChange={handleChange}
                        required
                      />
                    </Field>
                    <Field label="Alamat Lengkap di Mataram/Lombok" htmlFor="reg-address" required>
                      <Textarea
                        id="reg-address"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        rows={3}
                        required
                      />
                    </Field>
                  </>
                )}
                {role === 'technician' && (
                  <>
                    <Field label="Spesialisasi" htmlFor="reg-specialization" required>
                      <Select
                        id="reg-specialization"
                        name="specialization"
                        value={formData.specialization}
                        onChange={handleChange}
                        required
                      >
                        <option value="AC & Pendingin">AC & Pendingin</option>
                        <option value="Instalasi Listrik">Instalasi Listrik</option>
                        <option value="Pipa & Pompa Air">Pipa & Pompa Air</option>
                        <option value="Tukang Bangunan">Tukang Bangunan</option>
                        <option value="Maintenance Kolam Renang">Maintenance Kolam Renang</option>
                      </Select>
                    </Field>
                    <Field label="Pengalaman Kerja (Tahun)" htmlFor="reg-experience" required>
                      <Input
                        id="reg-experience"
                        type="number"
                        name="experience"
                        inputMode="numeric"
                        value={formData.experience}
                        onChange={handleChange}
                        className="font-mono"
                        required
                      />
                    </Field>
                  </>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col rounded-control border border-line bg-ground px-4 py-1">
                  <SummaryRow label="Peran">{ROLE_LABEL[role] || role}</SummaryRow>
                  <SummaryRow label="Nama">{formData.name}</SummaryRow>
                  <SummaryRow label="No. HP"><span className="font-mono font-medium">{formData.phone}</span></SummaryRow>
                  <SummaryRow label="Email">{formData.email}</SummaryRow>
                  {role === 'driver' && (
                    <>
                      <SummaryRow label="Kendaraan">
                        {formData.vehicle} (<span className="font-mono font-medium uppercase">{formData.plate}</span>) - {formData.vehicleType === 'mobil' ? 'Mobil' : 'Motor'}
                      </SummaryRow>
                      <SummaryRow label="Layanan">
                        {formData.jobTypePreferences
                          .map((t) => ({ ride: 'Ride', send: 'Kurir', food: 'Antar Makanan' }[t] || t))
                          .join(', ') || '-'}
                      </SummaryRow>
                      {formData.simPhoto && (
                        <SummaryRow label="Foto Dokumen">
                          <img src={formData.simPhoto} alt="SIM Preview" className="h-12 w-12 rounded-[8px] border border-line bg-sunken object-cover" />
                        </SummaryRow>
                      )}
                    </>
                  )}
                  {(role === 'merchant' || role === 'villa') && (
                    <SummaryRow label="Nama">{formData.restaurantName}</SummaryRow>
                  )}
                  {role === 'technician' && (
                    <SummaryRow label="Keahlian">{formData.specialization} (<span className="font-mono font-medium">{formData.experience}</span> thn)</SummaryRow>
                  )}
                </div>
                <p className="text-center text-xs leading-relaxed text-ink-muted">
                  Data akan langsung terkirim ke Admin Wira untuk proses verifikasi.
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row">
              {step > 1 && (
                <Button type="button" variant="secondary" size="lg" className="sm:flex-1" onClick={() => setStep(step - 1)}>
                  Kembali
                </Button>
              )}
              <Button type="submit" variant="primary" size="lg" className="sm:flex-1" isLoading={loading}>
                {loading ? 'Mengirim...' : step === 4 ? 'Kirim Pendaftaran' : 'Lanjut'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;
