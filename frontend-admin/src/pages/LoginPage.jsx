import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import WiraMark from '../components/brand/WiraMark';
import { Button, Card, Field, Input, Notice } from '../components/ui';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Email dan Password wajib diisi');
      return;
    }
    
    setIsLoggingIn(true);
    const result = await login(email, password);
    setIsLoggingIn(false);

    if (result.success) {
      toast.success('Berhasil masuk ke Dashboard');
      navigate('/dashboard');
    } else {
      toast.error(`Gagal masuk: ${result.error === 'Invalid login credentials' ? 'Email atau Password salah' : result.error}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ground px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-3" aria-label="Wira Admin">
            <WiraMark size={44} className="shrink-0" />
            <span className="flex items-baseline gap-2 leading-none">
              <span className="text-[32px] font-extrabold tracking-[-0.035em] text-ink">wira</span>
              <span className="text-[20px] font-medium tracking-tight text-ink-muted">admin</span>
            </span>
          </div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance sm:text-2xl">
            Masuk ke Sistem Keamanan
          </h1>
        </div>

        <Card padding="none" className="p-6 sm:p-8">
          <form className="flex flex-col gap-5" onSubmit={handleLogin}>
            <Field label="Email Administrator" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@wira.app"
                required
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="login-password" className="text-[13px] font-semibold text-ink">
                  Kata Sandi
                </label>
                <a href="#" className="text-[13px] font-semibold text-brand-ink hover:underline">
                  Lupa password?
                </a>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="text-right mt-[-8px] mb-2">
              <Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Lupa Password?</Link>
            </div>
            <Button type="submit" size="lg" block isLoading={isLoggingIn} className="mt-1">
              {isLoggingIn ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </Button>
          </form>
        </Card>

        <Notice tone="info" title="Informasi Kredensial:">
          Portal ini sekarang terhubung dengan Supabase Authentication. Silakan gunakan Email dan Password yang telah Anda buat di tab <b>Authentication &gt; Users</b> pada dashboard Supabase Anda.
        </Notice>
      </div>
    </div>
  );
};

export default LoginPage;
