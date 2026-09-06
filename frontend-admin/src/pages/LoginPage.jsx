import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center text-primary font-bold text-3xl sm:text-4xl mb-6">
          <span className="bg-primary text-white p-2 rounded-xl mr-2 leading-none">W</span>
          Wira Admin
        </div>
        <h2 className="mt-6 text-center text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Masuk ke Sistem Keamanan
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-6 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200 dark:border-slate-700">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email Administrator
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full px-4 py-2.5 border rounded-lg"
                  placeholder="admin@wira.app"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Kata Sandi
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full px-4 py-2.5 border rounded-lg"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <a href="#" className="font-medium text-primary hover:text-cyan-700 transition-colors">
                  Lupa password?
                </a>
              </div>
            </div>

            <div>
              <button 
                type="submit" 
                disabled={isLoggingIn}
                className="w-full btn-primary flex justify-center items-center py-2.5 text-base font-semibold"
              >
                {isLoggingIn ? <Loader2 className="animate-spin mr-2" size={20} /> : null}
                {isLoggingIn ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
              </button>
            </div>
            
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Informasi Kredensial:</p>
              Portal ini sekarang terhubung dengan Supabase Authentication. Silakan gunakan Email dan Password yang telah Anda buat di tab <b>Authentication &gt; Users</b> pada dashboard Supabase Anda.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
