import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error('Password dan konfirmasi tidak cocok!');
      return;
    }
    
    setLoading(true);
    try {
      await register(form.email, form.password, { name: form.name, phone: form.phone });
      toast.success('Pendaftaran berhasil! Silakan periksa kotak masuk/Spam Email Anda untuk verifikasi sebelum login.', { duration: 6000 });
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Gagal mendaftar. Pastikan email belum terdaftar dan password minimal 6 karakter.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">Daftar Akun Baru</h1>
        <form onSubmit={handleRegister} className="space-y-4">
          <input type="text" placeholder="Nama Lengkap" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400" required onChange={e=>setForm({...form, name: e.target.value})} />
          <input type="tel" placeholder="Nomor HP" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400" required onChange={e=>setForm({...form, phone: e.target.value})} />
          <input type="email" placeholder="Email" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400" required onChange={e=>setForm({...form, email: e.target.value})} />
          <input type="password" placeholder="Password (Min. 6 Karakter)" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400" required minLength={6} onChange={e=>setForm({...form, password: e.target.value})} />
          <input type="password" placeholder="Konfirmasi Password" className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400" required minLength={6} onChange={e=>setForm({...form, confirm: e.target.value})} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" required /> Saya setuju dengan Syarat & Ketentuan
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Memproses...' : 'Daftar Sekarang'}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-6">
          Sudah punya akun? <Link to="/login" className="text-primary font-semibold cursor-pointer hover:underline">Masuk</Link>
        </p>
      </Card>
    </div>
  );
}
