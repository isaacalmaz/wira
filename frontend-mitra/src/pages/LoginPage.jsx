import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Car, Store, Home, Wrench, Baby, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import WiraMark from '../components/brand/WiraMark';
import { Button, Card, Field, Input, cx } from '../components/ui';
import { friendlyError } from '../utils/friendlyError';
import { isEmailNotConfirmed, resendConfirmation } from '../utils/emailConfirm';

// Single source of truth for all 5 mitra portals - label, sub, and icon.
// Adding or updating a role here keeps the login UX consistent across portals.
const ROLE_CONFIG = {
  driver: { label: 'Driver', sub: 'Ojek & Mobil', icon: Car },
  merchant: { label: 'Restoran', sub: 'WiraFood', icon: Store },
  villa: { label: 'Villa', sub: 'WiraVilla', icon: Home },
  technician: { label: 'Teknisi', sub: 'Servis & Tukang', icon: Wrench },
  nanny: { label: 'Wira Asuh', sub: 'Pengasuh Anak', icon: Baby },
};
const ROLES = Object.keys(ROLE_CONFIG);

export default function LoginPage() {
  const location = useLocation();
  // Fresh sign-up: email filled in and the "confirm your email" note shown.
  const [email, setEmail] = useState(() => location.state?.email || '');
  const [password, setPassword] = useState('');
  const [intendedRole, setIntendedRole] = useState(() => {
    const searchRole = new URLSearchParams(location.search).get('role');
    if (searchRole && ROLES.includes(searchRole)) return searchRole;
    if (location.state?.role && ROLES.includes(location.state.role)) return location.state.role;
    return 'driver';
  });
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(() => !!location.state?.confirm);
  const [resending, setResending] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const resend = async () => {
    if (!email.trim()) return;
    setResending(true);
    try {
      await resendConfirmation(email);
      toast.success(`Email konfirmasi dikirim ulang ke ${email.trim()}.`);
    } catch {
      toast.error('Belum bisa mengirim ulang. Tunggu beberapa menit, lalu coba lagi.');
    } finally {
      setResending(false);
    }
  };

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
        toast.success(`Berhasil masuk ke portal ${ROLE_CONFIG[intendedRole]?.label || intendedRole}!`);
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
      if (isEmailNotConfirmed(error)) setNeedsConfirm(true);
      toast.error(friendlyError(error) || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  const current = ROLE_CONFIG[intendedRole] || ROLE_CONFIG.driver;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <div className="flex items-center gap-3">
        <WiraMark size={44} title="Wira Mitra" />
        <span className="flex items-baseline gap-1.5 leading-none" aria-hidden="true">
          <span className="text-[30px] font-extrabold tracking-[-0.035em] text-brand-ink">wira</span>
          <span className="text-[22px] font-medium tracking-[-0.02em] text-ink-muted">mitra</span>
        </span>
      </div>

      <Card padding="none" className="w-full max-w-[440px] overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          {/* Pilihan Portal */}
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[17px] font-bold leading-snug tracking-tight text-ink">
              Pilih portal layanan untuk masuk
            </h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROLES.map((r, idx) => {
                const config = ROLE_CONFIG[r];
                const Icon = config.icon;
                const isSelected = intendedRole === r;
                const isLastOnTwoCols = idx === ROLES.length - 1;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setIntendedRole(r)}
                    className={cx(
                      'flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-control border transition-all text-center min-h-[70px]',
                      isLastOnTwoCols ? 'col-span-2 sm:col-span-1' : '',
                      isSelected
                        ? 'border-brand bg-brand-soft text-brand-ink shadow-sm ring-1 ring-brand font-bold'
                        : 'border-line bg-sunken/40 text-ink-muted hover:border-line-strong hover:bg-card hover:text-ink font-semibold'
                    )}
                  >
                    <Icon size={19} className={isSelected ? 'text-brand-ink' : 'text-ink-muted'} aria-hidden="true" />
                    <div className="flex flex-col items-center">
                      <span className="text-[12.5px] leading-tight">{config.label}</span>
                      <span className={cx('text-[10.5px] leading-tight mt-0.5', isSelected ? 'text-brand-ink/80' : 'text-ink-muted/70')}>
                        {config.sub}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {needsConfirm && (
            <div role="status" className="flex flex-col gap-2.5 rounded-control border border-brand-line bg-brand-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
              <p>Konfirmasi email Anda dulu: buka email dari Wira (cek juga folder Spam) lalu ketuk tautannya. Setelah itu masuk di sini.</p>
              <Button type="button" size="sm" variant="secondary" isLoading={resending} disabled={!email.trim()} onClick={resend}>
                Kirim ulang email konfirmasi
              </Button>
            </div>
          )}

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

            <div className="text-right mt-[-8px] mb-2">
              <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">Lupa kata sandi?</Link>
            </div>
            <Button
              type="submit"
              size="lg"
              block
              className="mt-2 font-bold"
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
