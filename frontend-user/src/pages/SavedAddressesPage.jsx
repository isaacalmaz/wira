import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { toast } from 'react-hot-toast';
import { ArrowLeft, MapPin, Plus, Trash2, Home, Briefcase, Star } from 'lucide-react';

export default function SavedAddressesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    label: '',
    address: '',
    lat: -8.58333,
    lng: 116.11667
  });

  const fetchAddresses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAddresses(data || []);
    } catch (err) {
      console.error("Error fetching addresses:", err);
      toast.error('Gagal memuat alamat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.label || !formData.address) {
      toast.error('Label dan Alamat wajib diisi');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('saved_addresses')
        .insert([{
          user_id: user.id,
          label: formData.label,
          address: formData.address,
          lat: formData.lat,
          lng: formData.lng
        }]);

      if (error) throw error;
      
      toast.success('Alamat berhasil disimpan');
      setIsModalOpen(false);
      setFormData({ label: '', address: '', lat: -8.58333, lng: 116.11667 });
      fetchAddresses();
    } catch (err) {
      console.error('Error saving address:', err);
      toast.error('Gagal menyimpan alamat');
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase
        .from('saved_addresses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Alamat dihapus');
      fetchAddresses();
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Gagal menghapus alamat');
    }
  };

  const getIcon = (label) => {
    const l = label.toLowerCase();
    if (l.includes('rumah')) return <Home size={20} className="text-blue-500" />;
    if (l.includes('kantor') || l.includes('kerja')) return <Briefcase size={20} className="text-orange-500" />;
    return <Star size={20} className="text-amber-400" />;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
          <ArrowLeft size={20} className="dark:text-white" />
        </button>
        <h1 className="text-xl font-bold dark:text-white">Alamat Tersimpan</h1>
      </div>

      <Button onClick={() => setIsModalOpen(true)} className="w-full mb-4 flex items-center justify-center gap-2">
        <Plus size={18} /> Tambah Alamat Baru
      </Button>

      {loading ? (
        <div className="text-center p-8 text-slate-400">Memuat alamat...</div>
      ) : addresses.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-transparent shadow-none">
          <MapPin size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">Belum ada alamat</h3>
          <p className="text-sm text-slate-500">Simpan alamat rumah atau kantor Anda agar lebih mudah saat memesan.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <Card key={addr.id} className="p-4 flex items-start gap-4 hover:border-primary transition border-2 border-transparent">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full">
                {getIcon(addr.label)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 dark:text-white">{addr.label}</h3>
                <p className="text-sm text-slate-500 line-clamp-2">{addr.address}</p>
              </div>
              <button onClick={() => handleDelete(addr.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition">
                <Trash2 size={18} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Add Address Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 dark:text-white">Tambah Alamat</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Label (Contoh: Rumah Budi)</label>
                <input 
                  type="text" 
                  value={formData.label}
                  onChange={(e) => setFormData({...formData, label: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-xl dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-slate-300">Detail Alamat</label>
                <textarea 
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border rounded-xl dark:text-white"
                  rows="3"
                  required
                ></textarea>
              </div>
              <div className="flex gap-3 mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" className="flex-1">
                  Simpan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
