import { useState } from 'react';
import { supabase } from '../config/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, Field, Input } from '../components/ui';
import toast from 'react-hot-toast';
import { resetRedirect } from '../utils/emailConfirm';
import { useTranslation } from '../i18n';
import { friendlyError } from '../utils/friendlyError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect(),
      });
      if (error) throw error;
      toast.success(t('auth.reset_link_sent') || 'Tautan reset password telah dikirim ke email Anda.');
      navigate('/login');
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err) || t('auth.reset_link_failed') || 'Gagal mengirim tautan reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ground px-4 py-10">
      <Card padding="none" className="w-full max-w-[400px] overflow-hidden border-0">
        <div className="h-2.5 tenun-band" />
        <div className="p-6 sm:p-7 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold text-ink">{t('auth.forgot_password_title') || 'Lupa Kata Sandi'}</h1>
            <p className="text-sm text-ink-muted">{t('auth.forgot_password_desc') || 'Masukkan email Anda untuk menerima tautan reset password.'}</p>
          </div>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <Field label={t('auth.email_label') || 'Email'} htmlFor="reset-email">
              <Input
                id="reset-email"
                type="email"
                placeholder="email@contoh.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" block size="lg" isLoading={loading} className="mt-2">
              {t('auth.send_link') || 'Kirim Tautan'}
            </Button>
          </form>
        </div>
      </Card>
      <div className="mt-6 text-center text-sm">
        <Link to="/login" className="text-brand hover:underline font-medium">
          {t('auth.back_to_login') || 'Kembali ke Login'}
        </Link>
      </div>
    </div>
  );
}
