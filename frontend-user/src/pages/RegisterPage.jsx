import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { Button, Card, Field, Input } from '../components/ui';
import WiraMark from '../components/brand/WiraMark';

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

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-7 bg-ground px-4 py-10">
      <div className="flex items-center gap-3">
        <WiraMark size={44} title="Wira" />
        <span className="text-[30px] font-extrabold leading-none tracking-[-0.035em] text-brand-ink" aria-hidden="true">wira</span>
      </div>

      <Card padding="none" className="w-full max-w-[400px] overflow-hidden">
        <div className="h-1.5 tenun-band" aria-hidden="true" />
        <div className="flex flex-col gap-6 p-6 sm:p-7">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance">{t('auth.register_title')}</h1>
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <Field label={t('auth.name_label')} htmlFor="register-name">
              <Input id="register-name" type="text" autoComplete="name" placeholder={t('auth.name_placeholder')} required onChange={e=>setForm({...form, name: e.target.value})} />
            </Field>
            <Field label={t('auth.phone_label')} htmlFor="register-phone">
              <Input id="register-phone" type="tel" autoComplete="tel" inputMode="tel" className="font-mono" placeholder={t('auth.phone_placeholder')} required onChange={e=>setForm({...form, phone: e.target.value})} />
            </Field>
            <Field label={t('auth.email')} htmlFor="register-email">
              <Input id="register-email" type="email" autoComplete="email" inputMode="email" placeholder={t('auth.email_placeholder')} required onChange={e=>setForm({...form, email: e.target.value})} />
            </Field>
            <Field label={t('auth.password')} htmlFor="register-password">
              <Input id="register-password" type="password" autoComplete="new-password" placeholder={t('auth.register_password_placeholder')} required minLength={6} onChange={e=>setForm({...form, password: e.target.value})} />
            </Field>
            <Field label={t('auth.confirm_password_label')} htmlFor="register-confirm">
              <Input id="register-confirm" type="password" autoComplete="new-password" placeholder={t('auth.confirm_password_placeholder')} required minLength={6} onChange={e=>setForm({...form, confirm: e.target.value})} />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-relaxed text-ink">
              <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 rounded-[6px] border-line-strong bg-card text-brand focus:ring-brand/20" />
              <span>{t('auth.terms_agree')}</span>
            </label>
            <Button type="submit" block size="lg" className="mt-1" isLoading={loading}>
              {loading ? t('common.processing') : t('auth.register_submit')}
            </Button>
          </form>
        </div>
      </Card>

      <p className="text-center text-sm text-ink-muted">
        {t('auth.has_account')}{' '}
        <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-ink hover:underline">{t('auth.login_link')}</Link>
      </p>
    </div>
  );
}
