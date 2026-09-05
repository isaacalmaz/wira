import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '' });
  const navigate = useNavigate();

  const handleRegister = (e) => {
    e.preventDefault();
    if(form.password === form.confirm) navigate('/otp');
    else alert('Password tidak cocok!');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-white">
        <h1 className="text-2xl font-bold mb-6 text-center text-primary">Daftar Akun Baru</h1>
        <form onSubmit={handleRegister} className="space-y-4">
          <input type="text" placeholder="Nama Lengkap" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary" required onChange={e=>setForm({...form, name: e.target.value})} />
          <input type="tel" placeholder="Nomor HP" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary" required onChange={e=>setForm({...form, phone: e.target.value})} />
          <input type="email" placeholder="Email" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary" required onChange={e=>setForm({...form, email: e.target.value})} />
          <input type="password" placeholder="Password" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary" required onChange={e=>setForm({...form, password: e.target.value})} />
          <input type="password" placeholder="Konfirmasi Password" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary" required onChange={e=>setForm({...form, confirm: e.target.value})} />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" required /> Saya setuju dengan Syarat & Ketentuan</label>
          <Button type="submit" className="w-full">Daftar Sekarang</Button>
        </form>
      </Card>
    </div>
  );
}
