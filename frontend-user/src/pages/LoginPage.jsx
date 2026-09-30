import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';

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
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white/95 backdrop-blur">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center text-3xl text-white font-bold mb-4 shadow-lg">W</div>
          <h1 className="text-2xl font-bold text-slate-800">{t('auth.login_title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.login_subtitle')}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('auth.email')}</label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
              placeholder={t('auth.email_placeholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('auth.password')}</label>
            <input
              type="password"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full mt-6" size="lg" disabled={loading}>
            {loading ? t('common.processing') : t('auth.login_submit')}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          {t('auth.no_account')} <Link to="/register" className="text-primary font-semibold cursor-pointer hover:underline">{t('auth.register_link')}</Link>
        </p>
      </Card>
    </div>
  );
}
