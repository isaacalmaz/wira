import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    // Validasi sederhana
    if (!email || !password) {
      toast.error('Email dan Password wajib diisi');
      return;
    }
    
    // Panggil fungsi login dari context
    const success = login(email, password);
    if (success) {
      toast.success('Berhasil masuk');
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-primary font-bold text-4xl mb-6">
          <span className="bg-primary text-white p-2 rounded-xl mr-2">W</span>
          Wira Admin
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 dark:text-white">
          Masuk ke Dashboard
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200 dark:border-slate-700">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email / Username
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full px-3 py-2 border rounded-md"
                  placeholder="admin@wira.id"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full px-3 py-2 border rounded-md"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <a href="#" className="font-medium text-primary hover:text-cyan-700">
                  Lupa password?
                </a>
              </div>
            </div>

            <div>
              <button type="submit" className="w-full btn-primary flex justify-center">
                Masuk
              </button>
            </div>
            
            <p className="text-xs text-center text-slate-500 mt-4">
              Gunakan email apapun (mengandung 'super' untuk Superadmin) untuk MVP ini.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
