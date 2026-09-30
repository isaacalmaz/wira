import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleRegister = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error(t('auth.password_mismatch'));
      return;
    }

    setLoading(true);
    try {
      await register(form.email, form.password, { name: form.name, phone: form.phone });
      toast.success(t('auth.register_success'), { duration: 6000 });
      navigate('/login');
    } catch (err) {
      // Supabase's own message here is an untranslated developer string, so
      // we always show our own wording instead.
      console.error('Registration failed:', err);
      toast.error(t('auth.register_failed'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">{t('auth.register_title')}</h1>
        <form onSubmit={handleRegister} className="space-y-4">
          <input type="text" placeholder={t('auth.name_placeholder')} className={inputClass} required onChange={e=>setForm({...form, name: e.target.value})} />
          <input type="tel" placeholder={t('auth.phone_placeholder')} className={inputClass} required onChange={e=>setForm({...form, phone: e.target.value})} />
          <input type="email" placeholder={t('auth.email_placeholder')} className={inputClass} required onChange={e=>setForm({...form, email: e.target.value})} />
          <input type="password" placeholder={t('auth.register_password_placeholder')} className={inputClass} required minLength={6} onChange={e=>setForm({...form, password: e.target.value})} />
          <input type="password" placeholder={t('auth.confirm_password_placeholder')} className={inputClass} required minLength={6} onChange={e=>setForm({...form, confirm: e.target.value})} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" required /> {t('auth.terms_agree')}
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('common.processing') : t('auth.register_submit')}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-6">
          {t('auth.has_account')} <Link to="/login" className="text-primary font-semibold cursor-pointer hover:underline">{t('auth.login_link')}</Link>
        </p>
      </Card>
    </div>
  );
}
