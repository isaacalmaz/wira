import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Car, Store, Home, Wrench, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import WiraMark from '../components/brand/WiraMark';
import { Button, Card, Field, Input, Segmented } from '../components/ui';

// Single source of truth for the 4 mitra portals - label and icon, so
// adding a role later only means adding one entry here instead of touching
// every tab/button individually. Driver
// now covers Ride/Kurir/Makanan jobs together (self-service toggles in
// Settings, see migrations/0033) - there is no separate Kurir portal anymore.
const ROLE_CONFIG = {
  driver: { label: 'Driver', icon: Car },
  merchant: { label: 'Restoran', icon: Store },
  villa: { label: 'Villa', icon: Home },
  technician: { label: 'Teknisi', icon: Wrench },
};
const ROLES = Object.keys(ROLE_CONFIG);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [intendedRole, setIntendedRole] = useState('driver');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Harap isi email dan kata sandi');
      return;
    }

    setLoading(true);
    try {
      const { profile } = await login(email, password);
      const mitraAccess = profile?.mitra_access || [];

      // Login ke Supabase Auth berhasil tidak berarti akun ini punya akses
      // ke portal yang dipilih - toast dan arah navigasi mengikuti hasil
      // nyata dari mitra_access, bukan cuma status login itu sendiri.
      if (mitraAccess.includes(intendedRole)) {
        toast.success('Berhasil masuk!');
        navigate(`/${intendedRole}`);
      } else if (mitraAccess.length > 0) {
        toast.error(`Akun ini tidak terdaftar sebagai ${ROLE_CONFIG[intendedRole]?.label || intendedRole}. Mengarahkan ke portal Anda...`);
        navigate(`/${mitraAccess[0]}`);
      } else if (profile?.status === 'Pending') {
        toast('Akun Anda sedang menunggu verifikasi admin.', { icon: <Clock size={18} /> });
        navigate('/pending-verification');
      } else {
        toast.error('Akun ini belum terdaftar sebagai mitra.');
        navigate('/unauthorized');
      }
    } catch (error) {
      toast.error(error.message || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  const current = ROLE_CONFIG[intendedRole];
  const roleOptions = ROLES.map((role) => {
    const Icon = ROLE_CONFIG[role].icon;
    return {
      value: role,
      label: (
        <span className="inline-flex items-center justify-center gap-2">
          <Icon size={16} aria-hidden="true" /> {ROLE_CONFIG[role].label}
        </span>
      ),
    };
  });

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <div className="flex items-center gap-3">
        <WiraMark size={44} title="Wira Mitra" />
        <span className="flex items-baseline gap-1.5 leading-none" aria-hidden="true">
          <span className="text-[30px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
        </span>
      </div>

      <Card padding="none" className="w-full max-w-[420px] overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          {/* Pilihan Portal */}
          <div className="flex flex-col gap-3">
            <h1 className="text-[17px] font-bold leading-snug tracking-tight text-ink text-balance">
              Pilih portal layanan Anda untuk masuk
            </h1>
            <Segmented
              ariaLabel="Pilih portal layanan"
              options={roleOptions}
              value={intendedRole}
              onChange={setIntendedRole}
              className="grid w-full grid-cols-2"
            />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@contoh.com"
              />
            </Field>
            <Field label="Kata Sandi" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <Button
              type="submit"
              size="lg"
              block
              className="mt-2"
              isLoading={loading}
              leftIcon={<LogIn size={19} />}
            >
              Masuk sebagai {current.label}
            </Button>
          </form>
        </div>
      </Card>

      <p className="text-center text-sm text-ink-muted">
        Belum menjadi mitra?{' '}
        <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-ink hover:underline">
          Daftar Sekarang
        </Link>
      </p>
    </div>
  );
}
