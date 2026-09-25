import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { toast } from 'react-hot-toast';
import { ArrowLeft, User, Camera } from 'lucide-react';

export default function EditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    avatar_url: ''
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        setProfile({
          name: data.name || user.user_metadata?.name || '',
          email: data.email || user.email || '',
          phone: data.phone || user.user_metadata?.phone || '',
          avatar_url: data.avatar_url || ''
        });

        if (data.avatar_url) {
          const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(data.avatar_url);
          setPreview(publicData.publicUrl);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    };
    fetchProfile();
  }, [user]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let finalAvatarPath = profile.avatar_url;

      // 1. Upload Avatar if changed
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;
        finalAvatarPath = filePath;
      }

      // 2. Update Users Table
      const { error: updateError, data: updatedRows } = await supabase
        .from('users')
        .update({
          name: profile.name,
          email: profile.email,
          avatar_url: finalAvatarPath
        })
        .eq('id', user.id)
        .select();

      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) throw new Error('Akses ditolak atau profil tidak ditemukan.');
      
      toast.success('Profil berhasil diperbarui!');
      navigate('/profile');
    } catch (err) {
      console.error('Error updating profile:', err);
      toast.error('Gagal memperbarui profil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
          <ArrowLeft size={20} className="dark:text-white" />
        </button>
        <h1 className="text-xl font-bold dark:text-white">Edit Profil</h1>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-4">
          
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center overflow-hidden border-2 border-primary">
                {preview ? (
                  <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} />
                )}
              </div>
              <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full cursor-pointer shadow-lg hover:bg-blue-600 transition">
                <Camera size={16} />
                <input 
                  id="avatar-upload"
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-2">Ketuk ikon kamera untuk mengubah</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Lengkap</label>
            <input 
              type="text" 
              value={profile.name}
              onChange={(e) => setProfile({...profile, name: e.target.value})}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input 
              type="email" 
              value={profile.email}
              onChange={(e) => setProfile({...profile, email: e.target.value})}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nomor HP</label>
            <input 
              type="text" 
              value={profile.phone}
              disabled
              className="w-full p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Nomor HP tidak dapat diubah demi keamanan akun.</p>
          </div>

          <Button type="submit" className="w-full mt-6" disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
