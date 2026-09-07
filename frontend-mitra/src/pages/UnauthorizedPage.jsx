import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Car, Store, Wrench } from 'lucide-react';
import { Card } from '../components/shared/UIComponents';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';

const UnauthorizedPage = () => {
  const { user, logout } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [role, setRole] = useState('driver');
  const [formData, setFormData] = useState({
    vehicle: '', plate: '', simPhoto: null, restaurantName: '', address: '', specialization: '', experience: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const newMitra = {
      id: `MTR-${Date.now().toString().slice(-6)}`,
      auth_id: user.id,
      role: role,
      name: user.name || user.email,
      phone: user.phone || '',
      email: user.email,
      vehicle: role === 'driver' ? formData.vehicle : null,
      plate: role === 'driver' ? formData.plate : null,
      sim_photo: formData.simPhoto || null,
      restaurant_name: role === 'merchant' ? formData.restaurantName : null,
      address: role === 'merchant' ? formData.address : null,
      specialization: role === 'technician' ? formData.specialization : null,
      experience: role === 'technician' ? formData.experience : null,
      status: 'Pending',
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error: fetchErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      const currentList = Array.isArray(data?.features) ? data.features : [];
      const updatedList = [newMitra, ...currentList.filter(m => m.auth_id !== user.id || m.role !== role)];

      if (data) {
        await supabase.from('feature_flags').update({ features: updatedList }).eq('region', 'mitra_registrations');
      } else {
        await supabase.from('feature_flags').insert([{ region: 'mitra_registrations', features: updatedList }]);
      }
      
      // Update public.users status to Pending
      await supabase.from('users').update({ status: 'Pending' }).eq('id', user.id);
      
      toast.success('Pendaftaran mitra berhasil dikirim! Silakan tunggu persetujuan Admin.');
      window.location.reload(); // Reload to trigger routing to pending-verification
    } catch (err) {
      toast.error('Gagal mengirim pendaftaran: ' + err.message);
    }
    setLoading(false);
  };

  if (showUpgrade) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-lg p-6">
          <h1 className="text-2xl font-bold text-center text-primary mb-6">Daftar Menjadi Mitra</h1>
          
          <div className="flex gap-2 mb-6">
            <button onClick={() => setRole('driver')} className={`flex-1 py-2 text-sm font-semibold rounded-lg ${role === 'driver' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Car size={18} className="mx-auto mb-1"/> Driver</button>
            <button onClick={() => setRole('merchant')} className={`flex-1 py-2 text-sm font-semibold rounded-lg ${role === 'merchant' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Store size={18} className="mx-auto mb-1"/> Merchant</button>
            <button onClick={() => setRole('technician')} className={`flex-1 py-2 text-sm font-semibold rounded-lg ${role === 'technician' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Wrench size={18} className="mx-auto mb-1"/> Teknisi</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === 'driver' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Kendaraan (Merek & Tipe)</label>
                  <input required type="text" className="w-full p-3 border rounded-xl" placeholder="Honda Vario 150" value={formData.vehicle} onChange={e => setFormData({...formData, vehicle: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Plat Nomor</label>
                  <input required type="text" className="w-full p-3 border rounded-xl" placeholder="DR 1234 AB" value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value})} />
                </div>
              </>
            )}

            {role === 'merchant' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Nama Toko/Restoran</label>
                  <input required type="text" className="w-full p-3 border rounded-xl" placeholder="Warung Nasi Wira" value={formData.restaurantName} onChange={e => setFormData({...formData, restaurantName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Alamat Lengkap</label>
                  <textarea required className="w-full p-3 border rounded-xl" placeholder="Jl. Raya Wira No. 1" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
              </>
            )}

            {role === 'technician' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Spesialisasi</label>
                  <input required type="text" className="w-full p-3 border rounded-xl" placeholder="AC, Kulkas, Mesin Cuci" value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pengalaman (Tahun)</label>
                  <input required type="number" className="w-full p-3 border rounded-xl" placeholder="2" value={formData.experience} onChange={e => setFormData({...formData, experience: e.target.value})} />
                </div>
              </>
            )}

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={() => setShowUpgrade(false)} className="w-1/3 p-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300">Batal</button>
              <button type="submit" disabled={loading} className="w-2/3 p-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 shadow-lg disabled:opacity-50">
                {loading ? 'Mengirim...' : 'Kirim Pendaftaran'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <LogOut size={40} />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800">Akses Ditolak</h1>
        <p className="text-slate-600">
          Akun Anda belum terdaftar sebagai Mitra Wira (Driver, Merchant, atau Teknisi).
        </p>

        <div className="space-y-4 pt-4 border-t">
          <p className="text-sm text-slate-500 font-medium">Ingin bergabung menjadi Mitra?</p>
          <button 
            onClick={() => setShowUpgrade(true)}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-md"
          >
            Daftar Menjadi Mitra
          </button>
          
          <button 
            onClick={logout}
            className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
          >
            Ganti Akun
          </button>
        </div>
      </Card>
    </div>
  );
};
export default UnauthorizedPage;
