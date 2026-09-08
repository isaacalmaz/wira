import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/shared/UIComponents';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { toast } from 'react-hot-toast';
import { User, Phone, Save, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || ''
      });
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone
        })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Profil berhasil diperbarui!');
    } catch (error) {
      toast.error(`Gagal menyimpan: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">Pengaturan Akun</h1>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Lengkap</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></span>
              <input 
                type="text" 
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nomor Telepon</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={18} /></span>
              <input 
                type="tel" 
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="+62 8..."
                required
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Gunakan format internasional (misal: +62)</p>
          </div>

          <Button type="submit" variant="primary" className="w-full py-3 mt-4 flex items-center justify-center gap-2" disabled={loading}>
            <Save size={18} />
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>
      
      {/* Penjelasan Arsitektur */}
      <div className="text-center text-sm text-slate-500 pt-4">
        <p>Halaman ini dikelola secara dinamis via session (JWT)</p>
        <p>Bukan menggunakan parameter URL Publik (seperti /driver/:id)</p>
      </div>
    </div>
  );
};
export default SettingsPage;
