import { useState } from 'react';
import { supabase } from '../config/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, Field, Input } from '../components/ui';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      toast.success('Tautan reset password telah dikirim ke email Anda.');
      navigate('/login');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengirim tautan reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Card padding="none" className="w-full max-w-[400px] overflow-hidden shadow-lg border-0">
        <div className="h-1.5 bg-primary" />
        <div className="p-6 sm:p-7 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Lupa Password</h1>
            <p className="text-sm text-slate-500">Masukkan email Anda untuk menerima tautan reset password.</p>
          </div>
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="reset-email">
              <Input
                id="reset-email"
                type="email"
                placeholder="email@contoh.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" block size="lg" isLoading={loading} className="mt-2 bg-primary text-white hover:bg-primary/90">
              Kirim Tautan
            </Button>
          </form>
        </div>
      </Card>
      <div className="mt-6 text-center text-sm">
        <Link to="/login" className="text-primary hover:underline font-medium">
          Kembali ke Login
        </Link>
      </div>
    </div>
  );
}
