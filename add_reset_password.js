const fs = require('fs');
const path = require('path');

const apps = ['frontend-user', 'frontend-mitra', 'frontend-admin'];

const forgotPasswordContent = `import { useState } from 'react';
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
`;

const resetPasswordContent = `import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input } from '../components/ui';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase will automatically parse the hash and set the session.
    // If there is no session, redirect to login.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && !window.location.hash.includes('type=recovery')) {
        toast.error('Sesi tidak valid atau telah kedaluwarsa.');
        navigate('/login');
      }
    });
  }, [navigate]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password minimal 6 karakter.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password berhasil diubah!');
      navigate('/');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengubah password.');
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
            <h1 className="text-2xl font-bold text-slate-900">Buat Password Baru</h1>
            <p className="text-sm text-slate-500">Silakan masukkan password baru Anda.</p>
          </div>
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <Field label="Password Baru" htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" block size="lg" isLoading={loading} className="mt-2 bg-primary text-white hover:bg-primary/90">
              Simpan Password
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
`;

function patchLoginPage(appDir) {
  const loginPath = path.join(appDir, 'src', 'pages', 'LoginPage.jsx');
  if (!fs.existsSync(loginPath)) return;
  
  let content = fs.readFileSync(loginPath, 'utf8');
  if (content.includes('/forgot-password')) return; // already patched

  // For User and Mitra apps that use t('auth.password')
  // We need to inject the "Lupa Password" link below the password input, or above the button
  
  // Find where the </form> or the <Button type="submit" is
  const buttonRegex = /(<Button[^>]*type="submit"[^>]*>)/;
  if (buttonRegex.test(content)) {
    content = content.replace(buttonRegex, 
      `<div className="text-right mt-[-8px] mb-2">\n              <Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Lupa Password?</Link>\n            </div>\n            $1`
    );
    fs.writeFileSync(loginPath, content);
    console.log(`Patched ${loginPath}`);
  }
}

function patchApp(appDir) {
  const appPath = path.join(appDir, 'src', 'App.jsx');
  if (!fs.existsSync(appPath)) return;
  
  let content = fs.readFileSync(appPath, 'utf8');
  if (content.includes('ForgotPasswordPage')) return;
  
  // 1. Add imports
  content = content.replace(
    /import LoginPage from '.\/pages\/LoginPage';/g,
    `import LoginPage from './pages/LoginPage';\nimport ForgotPasswordPage from './pages/ForgotPasswordPage';\nimport ResetPasswordPage from './pages/ResetPasswordPage';`
  );
  
  // 2. Add Routes inside <Routes>
  // We find <Route path="/login" element={<LoginPage />} /> and inject below it
  content = content.replace(
    /(<Route[^>]*path="\/login"[^>]*\/>)/g,
    `$1\n        <Route path="/forgot-password" element={<ForgotPasswordPage />} />\n        <Route path="/reset-password" element={<ResetPasswordPage />} />`
  );
  
  fs.writeFileSync(appPath, content);
  console.log(`Patched ${appPath}`);
}

apps.forEach(app => {
  if (fs.existsSync(app)) {
    fs.writeFileSync(path.join(app, 'src', 'pages', 'ForgotPasswordPage.jsx'), forgotPasswordContent);
    fs.writeFileSync(path.join(app, 'src', 'pages', 'ResetPasswordPage.jsx'), resetPasswordContent);
    patchLoginPage(app);
    patchApp(app);
  }
});
