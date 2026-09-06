// =========================================
// 🔐 HALAMAN LOGIN MITRA WIRA
// Login untuk driver, merchant, dan teknisi
// =========================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Bike, Store, Wrench } from 'lucide-react';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('driver');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Demo accounts untuk testing
  const demoAccounts = {
    driver: { phone: '081234567890', password: 'demo123', name: 'Ahmad Supardi' },
    merchant: { phone: '081234567891', password: 'demo123', name: 'Warung Taliwang' },
    technician: { phone: '081234567892', password: 'demo123', name: 'Budi Teknisi' },
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    // Simulasi login
    await new Promise((r) => setTimeout(r, 1000));
    login({
      id: '00000000-0000-0000-0000-000000000001',
      name: demoAccounts[selectedRole].name,
      phone: phone || demoAccounts[selectedRole].phone,
      role: selectedRole,
    });
    setLoading(false);
    navigate(`/${selectedRole}`);
  };

  const handleDemoLogin = (role) => {
    setSelectedRole(role);
    setPhone(demoAccounts[role].phone);
    setPassword(demoAccounts[role].password);
  };

  const roles = [
    { key: 'driver', label: 'Driver', icon: Bike, color: 'bg-cyan-500' },
    { key: 'merchant', label: 'Merchant', icon: Store, color: 'bg-amber-500' },
    { key: 'technician', label: 'Teknisi', icon: Wrench, color: 'bg-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-600 via-teal-600 to-cyan-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Wira Mitra</h1>
          <p className="text-cyan-100">Dashboard untuk mitra Wira</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
          {/* Pilih Role */}
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 text-center">Masuk sebagai:</p>
          <div className="flex gap-2 mb-6">
            {roles.map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => handleDemoLogin(key)}
                className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  selectedRole === key
                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30'
                    : 'border-slate-200 dark:border-slate-600'
                }`}
              >
                <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center`}>
                  <Icon size={20} className="text-white" />
                </div>
                <span className="text-xs font-medium dark:text-slate-200">{label}</span>
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nomor Telepon
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Kata Sandi
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  Masuk
                </>
              )}
            </button>
          </form>

          {/* Register Link */}
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum punya akun?{' '}
              <button
                onClick={() => navigate('/register')}
                className="text-cyan-600 hover:underline font-medium"
              >
                Daftar Mitra
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
