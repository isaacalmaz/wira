import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Harap isi email dan kata sandi');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Berhasil masuk!');
      // Routing akan diurus otomatis oleh App.jsx berdasarkan 'role' dari AuthContext
      navigate('/');
    } catch (error) {
      toast.error(error.message || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 font-sans">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
        <div className="w-full max-w-md mx-auto">
          
          <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <span className="text-3xl font-black text-primary tracking-tighter">W</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight mb-2">
              Wira Mitra
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Masuk untuk mengelola pesanan & layanan Anda
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both border border-slate-100 dark:border-slate-700">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Kata Sandi
                  </label>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white py-3.5 px-4 rounded-xl font-bold transition-all disabled:opacity-50 mt-6"
              >
                {loading ? (
                  <span className="animate-spin border-2 border-white/20 border-t-white rounded-full w-5 h-5"></span>
                ) : (
                  <>
                    <LogIn size={20} />
                    Masuk Sekarang
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              Belum menjadi mitra?{' '}
              <Link to="/register" className="text-primary font-bold hover:underline">
                Daftar Sekarang
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
