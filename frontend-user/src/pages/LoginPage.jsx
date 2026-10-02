import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, Field, Input } from '../components/ui';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import WiraMark from '../components/brand/WiraMark';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success(t('auth.login_success'));
      navigate('/');
    } catch (err) {
      // Supabase's own message here is an untranslated developer string
      // ("Invalid login credentials"), so we always show our own wording.
      console.error('Login failed:', err);
      toast.error(t('auth.login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <div className="flex items-center gap-3">
        <WiraMark size={44} title="Wira" />
        <span className="text-[30px] font-extrabold leading-none tracking-[-0.035em] text-brand-ink" aria-hidden="true">wira</span>
      </div>

      <Card padding="none" className="w-full max-w-[400px] overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-6 p-6 sm:p-7">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">{t('auth.login_title')}</h1>
            <p className="text-sm leading-relaxed text-ink-muted">{t('auth.login_subtitle')}</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field label={t('auth.email')} htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t('auth.email_placeholder')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label={t('auth.password')} htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </Field>
            <div className="text-right mt-[-8px] mb-2">
              <Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Lupa Password?</Link>
            </div>
            <Button type="submit" block size="lg" className="mt-2" isLoading={loading}>
              {loading ? t('common.processing') : t('auth.login_submit')}
            </Button>
          </form>
        </div>
      </Card>

      <p className="text-center text-sm text-ink-muted">
        {t('auth.no_account')}{' '}
        <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-ink hover:underline">{t('auth.register_link')}</Link>
      </p>
    </div>
  );
}
