import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input } from '../components/ui';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { friendlyError } from '../utils/friendlyError';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase will automatically parse the hash and set the session.
    // If there is no session, redirect to login.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.hash.includes('type=recovery')) {
        toast.error(t('auth.session_invalid') || 'Sesi tidak valid atau telah kedaluwarsa.');
        navigate('/login');
      }
    });
  }, [navigate, t]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t('auth.password_min_length') || 'Password minimal 6 karakter.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t('auth.password_updated') || 'Password berhasil diubah!');
      navigate('/');
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err) || t('auth.password_update_failed') || 'Gagal mengubah password.');
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
            <h1 className="text-2xl font-bold text-ink">{t('auth.reset_password_title') || 'Buat Password Baru'}</h1>
            <p className="text-sm text-ink-muted">{t('auth.reset_password_desc') || 'Silakan masukkan password baru Anda.'}</p>
          </div>
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <Field label={t('auth.new_password_label') || 'Password Baru'} htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" block size="lg" isLoading={loading} className="mt-2">
              {t('auth.save_password') || 'Simpan Password'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
