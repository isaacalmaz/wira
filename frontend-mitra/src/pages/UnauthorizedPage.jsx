import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Car, Store, Home, Wrench } from 'lucide-react';
import { Card } from '../components/shared/UIComponents';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { submitMitraApplication } from '../services/mitraApplicationService';

// Mirrors RegisterPage.jsx's DEFAULT_JOB_PREFS_BY_VEHICLE exactly - this form
// duplicates RegisterPage's driver-upgrade logic (see file header rationale
// there), so the same vehicle_type -> job_type_preferences defaults must stay
// in sync: mobil never gets 'food' as an option at all (hard restriction, not
// a toggle - see migrations/0033).
const DEFAULT_JOB_PREFS_BY_VEHICLE = {
  motor: ['ride', 'send', 'food'],
  mobil: ['ride', 'send'],
};

const UnauthorizedPage = () => {
  const { user, logout } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [role, setRole] = useState('driver');
  const [formData, setFormData] = useState({
    vehicle: '', plate: '', vehicleType: 'motor', jobTypePreferences: DEFAULT_JOB_PREFS_BY_VEHICLE.motor,
    simPhoto: null, restaurantName: '', address: '', specialization: '', experience: ''
  });
  const [loading, setLoading] = useState(false);

  // Switching vehicle type resets job-type preferences to that vehicle's
  // sensible default, same as RegisterPage.jsx's handleVehicleTypeChange -
  // 'food' must never stay selectable for a mobil driver.
  const handleVehicleTypeChange = (vehicleType) => {
    setFormData((prev) => ({ ...prev, vehicleType, jobTypePreferences: DEFAULT_JOB_PREFS_BY_VEHICLE[vehicleType] }));
  };

  const toggleJobTypePreference = (jobType) => {
    setFormData((prev) => {
      const has = prev.jobTypePreferences.includes(jobType);
      return {
        ...prev,
        jobTypePreferences: has
          ? prev.jobTypePreferences.filter((t) => t !== jobType)
          : [...prev.jobTypePreferences, jobType],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const application = {
      role: role,
      name: user.name || user.email,
      phone: user.phone || '',
      email: user.email,
      vehicle: role === 'driver' ? formData.vehicle : null,
      plate: role === 'driver' ? formData.plate : null,
      // Previously missing entirely - DriverHomePage.jsx blocks going online
      // until vehicle_type is set, so a driver upgraded through this path
      // (without RegisterPage.jsx's step 3) got approved into a dead end.
      vehicle_type: role === 'driver' ? formData.vehicleType : null,
      job_type_preferences: role === 'driver' ? formData.jobTypePreferences : null,
      sim_photo: formData.simPhoto || null,
      restaurant_name: (role === 'merchant' || role === 'villa') ? formData.restaurantName : null,
      address: (role === 'merchant' || role === 'villa') ? formData.address : null,
      service_type: role === 'merchant' ? 'food' : role === 'villa' ? 'villa' : null,
      specialization: role === 'technician' ? formData.specialization : null,
      experience: role === 'technician' ? formData.experience : null,
    };

    try {
      await submitMitraApplication(supabase, application, user.id);

      // Update public.users status to Pending
      const { error: userErr, data: userData } = await supabase.from('users').update({ status: 'Pending' }).eq('id', user.id).select();
      if (userErr) throw userErr;
      if (!userData || userData.length === 0) throw new Error('Gagal memperbarui status akun (akses ditolak).');

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
          
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button onClick={() => setRole('driver')} className={`py-2 text-sm font-semibold rounded-lg ${role === 'driver' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Car size={18} className="mx-auto mb-1"/> Driver</button>
            <button onClick={() => setRole('merchant')} className={`py-2 text-sm font-semibold rounded-lg ${role === 'merchant' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Store size={18} className="mx-auto mb-1"/> Restoran</button>
            <button onClick={() => setRole('villa')} className={`py-2 text-sm font-semibold rounded-lg ${role === 'villa' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Home size={18} className="mx-auto mb-1"/> Villa</button>
            <button onClick={() => setRole('technician')} className={`py-2 text-sm font-semibold rounded-lg ${role === 'technician' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><Wrench size={18} className="mx-auto mb-1"/> Teknisi</button>
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

                {/* Kategori kendaraan - menentukan layanan apa saja yang bisa
                    dipilih di bawah (mobil tidak pernah bisa Antar Makanan).
                    Sama seperti RegisterPage.jsx langkah 3, wajib diisi di
                    sini juga agar driver yang upgrade lewat form ini tidak
                    terjebak tanpa vehicle_type (lihat DriverHomePage.jsx). */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Kategori Kendaraan</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'motor', label: 'Motor' },
                      { id: 'mobil', label: 'Mobil' },
                    ].map((v) => (
                      <label
                        key={v.id}
                        className={`p-3 border rounded-xl cursor-pointer text-center font-semibold text-sm transition-all ${
                          formData.vehicleType === v.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vehicleType"
                          value={v.id}
                          checked={formData.vehicleType === v.id}
                          onChange={() => handleVehicleTypeChange(v.id)}
                          className="hidden"
                        />
                        {v.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Preferensi layanan - Antar Makanan tidak pernah muncul
                    untuk mobil, sama seperti RegisterPage.jsx. */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Layanan yang Ingin Diterima</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 border rounded-lg border-slate-200 cursor-pointer">
                      <input type="checkbox" checked={formData.jobTypePreferences.includes('ride')} onChange={() => toggleJobTypePreference('ride')} />
                      <span className="text-sm">Ride (Antar Penumpang)</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 border rounded-lg border-slate-200 cursor-pointer">
                      <input type="checkbox" checked={formData.jobTypePreferences.includes('send')} onChange={() => toggleJobTypePreference('send')} />
                      <span className="text-sm">
                        Kurir (Antar Barang){formData.vehicleType === 'mobil' ? ' - khusus paket sedang/besar' : ''}
                      </span>
                    </label>
                    {formData.vehicleType !== 'mobil' && (
                      <label className="flex items-center gap-2 p-2.5 border rounded-lg border-slate-200 cursor-pointer">
                        <input type="checkbox" checked={formData.jobTypePreferences.includes('food')} onChange={() => toggleJobTypePreference('food')} />
                        <span className="text-sm">Antar Makanan (WiraFood)</span>
                      </label>
                    )}
                  </div>
                </div>
              </>
            )}

            {(role === 'merchant' || role === 'villa') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">{role === 'villa' ? 'Nama Villa/Penginapan' : 'Nama Toko/Restoran'}</label>
                  <input required type="text" className="w-full p-3 border rounded-xl" placeholder={role === 'villa' ? 'Villa Senggigi Sunset' : 'Warung Nasi Wira'} value={formData.restaurantName} onChange={e => setFormData({...formData, restaurantName: e.target.value})} />
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
          Akun Anda belum terdaftar sebagai Mitra Wira (Driver, Restoran, Villa, atau Teknisi).
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
