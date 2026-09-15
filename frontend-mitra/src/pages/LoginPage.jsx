import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Car, Store, Home, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Single source of truth for the 4 mitra portals - label, icon, and the
// active/button color per role, so adding a role later only means adding
// one entry here instead of touching every tab/button individually.
const ROLE_CONFIG = {
  driver: { label: 'Driver', icon: Car, active: 'text-blue-600', button: 'bg-blue-600 hover:bg-blue-700' },
  merchant: { label: 'Restoran', icon: Store, active: 'text-amber-600', button: 'bg-amber-500 hover:bg-amber-600' },
  villa: { label: 'Villa', icon: Home, active: 'text-violet-600', button: 'bg-violet-600 hover:bg-violet-700' },
  technician: { label: 'Teknisi', icon: Wrench, active: 'text-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-700' },
};
const ROLES = Object.keys(ROLE_CONFIG);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [intendedRole, setIntendedRole] = useState('driver');
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
      const { profile } = await login(email, password);
      const mitraAccess = profile?.mitra_access || [];

      // Login ke Supabase Auth berhasil tidak berarti akun ini punya akses
      // ke portal yang dipilih - toast dan arah navigasi mengikuti hasil
      // nyata dari mitra_access, bukan cuma status login itu sendiri.
      if (mitraAccess.includes(intendedRole)) {
        toast.success('Berhasil masuk!');
        navigate(`/${intendedRole}`);
      } else if (mitraAccess.length > 0) {
        toast.error(`Akun ini tidak terdaftar sebagai ${ROLE_CONFIG[intendedRole]?.label || intendedRole}. Mengarahkan ke portal Anda...`);
        navigate(`/${mitraAccess[0]}`);
      } else if (profile?.status === 'Pending') {
        toast('Akun Anda sedang menunggu verifikasi admin.', { icon: '⏳' });
        navigate('/pending-verification');
      } else {
        toast.error('Akun ini belum terdaftar sebagai mitra.');
        navigate('/unauthorized');
      }
    } catch (error) {
      toast.error(error.message || 'Gagal masuk. Periksa kembali email dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  };

  const current = ROLE_CONFIG[intendedRole];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 font-sans">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-24">
        <div className="w-full max-w-md mx-auto">

          <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <span className="text-3xl font-black text-primary tracking-tighter">W</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight mb-2">
              Wira Mitra
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Pilih portal layanan Anda untuk masuk
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both border border-slate-100 dark:border-slate-700">

            {/* Pilihan Portal */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl mb-6">
              {ROLES.map((role) => {
                const cfg = ROLE_CONFIG[role];
                const Icon = cfg.icon;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setIntendedRole(role)}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                      intendedRole === role ? `bg-white dark:bg-slate-800 ${cfg.active} shadow` : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon size={16} /> {cfg.label}
                  </button>
                );
              })}
            </div>

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
                className={`w-full flex items-center justify-center gap-2 text-white py-3.5 px-4 rounded-xl font-bold transition-all disabled:opacity-50 mt-6 ${current.button}`}
              >
                {loading ? (
                  <span className="animate-spin border-2 border-white/20 border-t-white rounded-full w-5 h-5"></span>
                ) : (
                  <>
                    <LogIn size={20} />
                    Masuk sebagai {current.label}
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
