import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Clock, ChevronRight, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';
import WiraMark from '../components/brand/WiraMark';
import { Button, Card, Field, Input, Badge, cx } from '../components/ui';
import { friendlyError } from '../utils/friendlyError';
import { isEmailNotConfirmed, resendConfirmation } from '../utils/emailConfirm';
import { supabase } from '../config/supabase';
import { ROLE_CONFIG, MITRA_ROLES, getStoredActiveMode, setStoredActiveMode } from '../constants/roles';

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, mitraAccess, login, logout } = useAuth();

  // Fresh sign-up: email filled in and the "confirm your email" note shown.
  const [email, setEmail] = useState(() => location.state?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(() => !!location.state?.confirm);
  const [resending, setResending] = useState(false);

  // When a user with multiple partner roles signs in, show the role chooser
  const [multiRoleData, setMultiRoleData] = useState(null);

  // If already authenticated and visiting /login:
  // - If single role: redirect directly to that portal
  // - If multi-role: show the role chooser so they can select their workspace
  // - If pending verification: redirect to /pending-verification
  // - If 0 roles / customer: redirect to /pending-verification or /register gracefully
  useEffect(() => {
    if (!user) return;

    if (user.status === 'Diblokir') {
      navigate('/unauthorized', { replace: true });
      return;
    }

    if (user.status === 'Pending') {
      navigate('/pending-verification', { replace: true });
      return;
    }

    const valid = (mitraAccess || []).filter((r) => MITRA_ROLES.includes(r));
    if (valid.length === 1) {
      navigate(`/${valid[0]}`, { replace: true });
    } else if (valid.length > 1) {
      if (!multiRoleData) {
        setMultiRoleData({
          name: user.name || user.email?.split('@')[0] || 'Mitra',
          roles: valid,
        });
      }
    } else if (valid.length === 0 && Array.isArray(mitraAccess)) {
      supabase
        .from('mitra_applications')
        .select('status')
        .eq('auth_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data: app }) => {
          if (app?.status === 'Pending') {
            navigate('/pending-verification', { replace: true });
          } else if (app?.status === 'Rejected') {
            navigate('/unauthorized', { replace: true });
          } else {
            navigate('/register', { replace: true });
          }
        })
        .catch(() => {
          navigate('/register', { replace: true });
        });
    }
  }, [user, mitraAccess, navigate, multiRoleData]);

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
      const { user: authUser, profile } = await login(email, password);

      // Check account status first
      if (profile?.status === 'Diblokir') {
        toast.error('Akun dinonaktifkan oleh admin.');
        navigate('/unauthorized', { replace: true });
        return;
      }

      if (profile?.status === 'Pending') {
        toast('Akun Anda sedang menunggu verifikasi admin.', { icon: <Clock size={18} /> });
        navigate('/pending-verification', { replace: true });
        return;
      }

      // Extract assigned partner roles
      let roles = profile?.mitra_access;
      if (!Array.isArray(roles) || roles.length === 0) {
        const legacyRole = profile?.role === 'courier' ? 'driver' : profile?.role;
        if (MITRA_ROLES.includes(legacyRole)) {
          roles = [legacyRole];
        } else {
          roles = [];
        }
      }

      const validRoles = roles.filter((r) => MITRA_ROLES.includes(r));

      if (validRoles.length === 1) {
        const singleRole = validRoles[0];
        setStoredActiveMode(singleRole);
        toast.success(`Berhasil masuk ke portal ${ROLE_CONFIG[singleRole]?.label || singleRole}!`);
        navigate(`/${singleRole}`, { replace: true });
      } else if (validRoles.length > 1) {
        // Multi-role partner: present post-login role picker
        toast.success('Berhasil masuk! Silakan pilih peran Anda.');
        setMultiRoleData({
          name: profile?.name || authUser?.user_metadata?.name || email.split('@')[0],
          roles: validRoles,
        });
      } else {
        // Check if there is an application pending
        try {
          const { data: app } = await supabase
            .from('mitra_applications')
            .select('id, status')
            .eq('auth_id', authUser?.id || profile?.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (app?.status === 'Pending') {
            toast('Pendaftaran mitra Anda sedang ditinjau admin.', { icon: <Clock size={18} /> });
            navigate('/pending-verification', { replace: true });
            return;
          }

          if (app?.status === 'Rejected') {
            navigate('/unauthorized', { replace: true });
            return;
          }
        } catch {
          // Ignore lookup failure
        }

        // Gracefully redirect brand new customer applying as partner
        toast('Akun Anda belum terdaftar sebagai mitra. Silakan lengkapi pendaftaran.', { icon: 'ℹ️' });
        navigate('/register', { replace: true });
      }
    } catch (error) {
      if (isEmailNotConfirmed(error)) setNeedsConfirm(true);
      toast.error(friendlyError(error) || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = (role) => {
    setStoredActiveMode(role);
    const label = ROLE_CONFIG[role]?.label || role;
    toast.success(`Membuka portal ${label}...`);
    navigate(`/${role}`, { replace: true });
  };

  const handleLogout = async () => {
    await logout();
    setMultiRoleData(null);
    setPassword('');
  };

  const lastActiveRole = getStoredActiveMode();

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

        {multiRoleData ? (
          /* Post-Login Multi-Role Picker */
          <div className="flex flex-col gap-6 p-5 sm:p-7">
            <div className="flex flex-col gap-1.5 text-center sm:text-left">
              <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-ink">
                Pilih Ruang Kerja Mitra
              </h1>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">
                Halo, <span className="font-semibold text-ink">{multiRoleData.name}</span>! Akun Anda terdaftar untuk beberapa peran mitra Wira. Silakan pilih portal yang ingin Anda buka:
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {multiRoleData.roles.map((r) => {
                const config = ROLE_CONFIG[r];
                if (!config) return null;
                const Icon = config.icon;
                const isPreferred = r === lastActiveRole;

                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className={cx(
                      'group flex w-full min-h-16 items-center justify-between gap-3.5 rounded-card border p-4 text-left transition-all',
                      isPreferred
                        ? 'border-brand bg-brand-soft/30 shadow-sm ring-1 ring-brand hover:bg-brand-soft/50'
                        : 'border-line bg-card hover:border-brand-line hover:bg-brand-soft/20'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className={cx(
                        'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border transition-colors',
                        isPreferred
                          ? 'border-brand-line bg-brand-soft text-brand-ink'
                          : 'border-line bg-sunken text-ink-muted group-hover:border-brand-line group-hover:bg-brand-soft group-hover:text-brand-ink'
                      )}>
                        <Icon size={22} />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-bold text-ink leading-tight">
                            {config.label}
                          </span>
                          {isPreferred && (
                            <Badge tone="brand" className="text-[10.5px] py-0 px-2">
                              Terakhir
                            </Badge>
                          )}
                        </div>
                        <span className="text-[12px] text-ink-muted leading-snug mt-0.5 line-clamp-1">
                          {config.description || config.sub}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center pl-2 text-ink-muted group-hover:text-brand-ink transition-transform group-hover:translate-x-1">
                      <ChevronRight size={20} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-line pt-4">
              <Button
                type="button"
                variant="secondary"
                size="md"
                block
                leftIcon={<LogOut size={17} />}
                onClick={handleLogout}
              >
                Ganti Akun / Keluar
              </Button>
            </div>
          </div>
        ) : (
          /* Clean Direct Login Form (Grid role removed) */
          <div className="flex flex-col gap-6 p-5 sm:p-7">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[20px] font-bold leading-tight tracking-tight text-ink">
                Masuk ke Portal Mitra
              </h1>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">
                Masuk dengan akun mitra Anda untuk mengakses layanan dan pesanan.
              </p>
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
                  required
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
                  required
                />
              </Field>

              <div className="text-right -mt-2 mb-1">
                <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">
                  Lupa kata sandi?
                </Link>
              </div>

              <Button
                type="submit"
                size="lg"
                block
                className="font-bold"
                isLoading={loading}
                leftIcon={<LogIn size={19} />}
              >
                Masuk
              </Button>
            </form>
          </div>
        )}
      </Card>

      {!multiRoleData && (
        <p className="text-center text-sm text-ink-muted">
          Belum punya akun mitra?{' '}
          <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-ink hover:underline">
            Daftar di sini
          </Link>
        </p>
      )}
    </div>
  );
}
