import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Car, Ban, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';

const DriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Ambil driver aktif
    const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (activeErr) console.error("Error fetching drivers:", activeErr);
    if (allUsers) {
      const activeDrivers = allUsers.filter(u => Array.isArray(u.mitra_access) && u.mitra_access.includes('driver'));
      setDrivers(activeDrivers);
    }

    // 2. Ambil driver pending dari feature_flags
    const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
    if (flagsData && Array.isArray(flagsData.features)) {
      const p = flagsData.features.filter(m => m.role === 'driver' && m.status === 'Pending');
      setPendingDrivers(p);
    }
    
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleVerify = async (id, accept, notes = '') => {
    // 1. Update status di feature_flags
    const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
    let updatedFeatures = [];
    if (flagsData && Array.isArray(flagsData.features)) {
      updatedFeatures = flagsData.features.map(f => f.id === id ? { ...f, status: accept ? 'Active' : 'Rejected' } : f);
      await supabase.from('feature_flags').update({ features: updatedFeatures }).eq('region', 'mitra_registrations');
    }

    if (accept) {
      // 2. Berikan akses driver ke public.users
      const pending = pendingDrivers.find(m => m.id === id);
      if (pending && pending.auth_id) {
        // Ambil data user saat ini
        const { data: userProfile } = await supabase.from('users').select('*').eq('id', pending.auth_id).single();
        if (userProfile) {
          const currentAccess = userProfile.mitra_access || [];
          if (!currentAccess.includes('driver')) {
            currentAccess.push('driver');
          }
          const { error: updateErr } = await supabase.from('users').update({ 
            mitra_access: currentAccess,
            status: 'Aktif'
          }).eq('id', pending.auth_id);
          
          if (updateErr) {
            console.error("Update users error:", updateErr);
            toast.error("Gagal mengupdate database profil driver.");
            return;
          }
        }
      }
      toast.success(`Driver berhasil disetujui!`);
    } else {
      toast.error(`Pendaftaran ditolak.`);
    }
    setIsReviewOpen(false);
    fetchData();
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    await supabase.from('users').update({ status: newStatus }).eq('id', id);
    toast.success(`Status diubah menjadi ${newStatus}`);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="text-primary"/> Manajemen Driver</h1>
          <p className="text-sm text-slate-500">Daftar Mitra Pengemudi Wira</p>
        </div>
      </div>
      
      {/* Antrean Persetujuan (Hanya muncul jika ada) */}
      {pendingDrivers.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-amber-800 mb-2">Perlu Persetujuan ({pendingDrivers.length})</h2>
          <div className="space-y-3">
            {pendingDrivers.map(pending => (
              <div key={pending.id} className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-amber-100">
                <div>
                  <p className="font-bold text-slate-800">{pending.name}</p>
                  <p className="text-xs text-slate-500">{pending.vehicle} - {pending.plate}</p>
                </div>
                <button 
                  onClick={() => { setSelectedDriver(pending); setIsReviewOpen(true); }}
                  className="px-3 py-1.5 bg-amber-100 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-200 flex items-center gap-1"
                >
                  <Eye size={16}/> Tinjau
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center">Memuat...</div> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4">Nama Driver</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Telepon</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{d.name}</td>
                  <td className="px-6 py-4 text-slate-500">{d.email}</td>
                  <td className="px-6 py-4">{d.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${d.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {d.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(d.id, d.status || 'Aktif')} className="text-slate-400 hover:text-primary">
                      {d.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">Tidak ada pengemudi aktif</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedDriver && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedDriver}
          onVerify={handleVerify}
        />
      )}
    </div>
  );
};
export default DriversPage;
