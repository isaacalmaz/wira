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
    try {
      const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (activeErr) throw activeErr;
      if (allUsers) {
        const activeMitras = allUsers.filter(u => {
          if (!u.mitra_access) return false;
          if (Array.isArray(u.mitra_access)) return u.mitra_access.includes('driver');
          if (typeof u.mitra_access === 'string') return u.mitra_access.includes('driver');
          return false;
        });
        setDrivers(activeMitras);
      }

      const { data: flagsData, error: flagsErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;
      if (flagsData && Array.isArray(flagsData.features)) {
        const p = flagsData.features.filter(m => m.role === 'driver' && m.status === 'Pending');
        setPendingDrivers(p);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleVerify = async (id, accept, notes = '') => {
    try {
      const { data: flagsData, error: flagsErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;
      
      let updatedFeatures = [];
      if (flagsData && Array.isArray(flagsData.features)) {
        updatedFeatures = flagsData.features.map(f => f.id === id ? { ...f, status: accept ? 'Active' : 'Rejected' } : f);
        const { error: updateFlagsErr } = await supabase.from('feature_flags').update({ features: updatedFeatures }).eq('region', 'mitra_registrations');
        if (updateFlagsErr) throw updateFlagsErr;
      }

      if (accept) {
        const pending = pendingDrivers.find(m => m.id === id);
        if (pending && pending.auth_id) {
          const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).single();
          if (profileErr && profileErr.code !== 'PGRST116') throw profileErr;
          
          let currentAccess = [];
          let isExisting = false;

          if (userProfile) {
            currentAccess = userProfile.mitra_access || [];
            isExisting = true;
          }

          if (!currentAccess.includes('driver')) {
            currentAccess.push('driver');
          }

          if (isExisting) {
            const { error: updateErr, data: updatedUser } = await supabase.from('users').update({ 
              mitra_access: currentAccess,
              status: 'Aktif'
            }).eq('id', pending.auth_id).select();
            
            if (updateErr) throw updateErr;
            if (!updatedUser || updatedUser.length === 0) {
              throw new Error("Gagal! Anda diblokir oleh sistem keamanan RLS Supabase.");
            }
          } else {
            const { error: insertErr } = await supabase.from('users').insert([{
              id: pending.auth_id,
              name: pending.name,
              email: pending.email,
              phone: pending.phone,
              role: 'mitra',
              status: 'Aktif',
              mitra_access: currentAccess
            }]);
            if (insertErr) throw insertErr;
          }
        }
        toast.success('Driver berhasil disetujui!');
      } else {
        toast.success('Pendaftaran ditolak.');
      }
      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi');
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    try {
      const { error, data } = await supabase.from('users').update({ status: newStatus }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success(`Status diubah menjadi ${newStatus}`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status');
    }
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
