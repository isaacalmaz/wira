import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Wrench, Ban, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';

const TechniciansPage = () => {
  const [techs, setTechs] = useState([]);
  const [pendingTechs, setPendingTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Ambil teknisi aktif
    const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (activeErr) console.error("Error fetching techs:", activeErr);
    if (allUsers) {
      const activeTechs = allUsers.filter(u => {
        if (!u.mitra_access) return false;
        if (Array.isArray(u.mitra_access)) return u.mitra_access.includes('technician');
        if (typeof u.mitra_access === 'string') return u.mitra_access.includes('technician');
        return false;
      });
      setTechs(activeTechs);
    }

    // 2. Ambil teknisi pending dari feature_flags
    const { data: flagsData } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
    if (flagsData && Array.isArray(flagsData.features)) {
      const p = flagsData.features.filter(m => m.role === 'technician' && m.status === 'Pending');
      setPendingTechs(p);
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
      // 2. Berikan akses technician ke public.users
      const pending = pendingTechs.find(m => m.id === id);
      if (pending && pending.auth_id) {
        // Ambil data user saat ini
        const { data: userProfile } = await supabase.from('users').select('*').eq('id', pending.auth_id).single();
        
        let currentAccess = [];
        let isExisting = false;

        if (userProfile) {
          currentAccess = userProfile.mitra_access || [];
          isExisting = true;
        }

        if (!currentAccess.includes('technician')) {
          currentAccess.push('technician');
        }

        if (isExisting) {
          const { error: updateErr, data: updatedUser } = await supabase.from('users').update({ 
            mitra_access: currentAccess,
            status: 'Aktif'
          }).eq('id', pending.auth_id).select();
          
          if (updateErr) {
             console.error("Update users error:", updateErr);
             toast.error("Gagal mengupdate database profil teknisi.");
             return;
          }
          if (!updatedUser || updatedUser.length === 0) {
            toast.error("Gagal! Anda diblokir oleh sistem keamanan RLS Supabase. Silakan jalankan script SQL RLS di Dashboard.");
            return;
          }
        } else {
          // INSERT INTO public.users
          const { error: insertErr } = await supabase.from('users').insert([{
            id: pending.auth_id,
            name: pending.name,
            email: pending.email,
            phone: pending.phone,
            role: 'mitra',
            status: 'Aktif',
            mitra_access: currentAccess
          }]);
          if (insertErr) {
             console.error("Insert users error:", insertErr);
             toast.error("Gagal membuat profil teknisi di database.");
             return;
          }
        }
      }
      toast.success(`Teknisi berhasil disetujui!`);
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="text-primary"/> Manajemen Teknisi</h1>
          <p className="text-sm text-slate-500">Daftar Mitra Jasa Servis</p>
        </div>
      </div>
      
      {/* Antrean Persetujuan (Hanya muncul jika ada) */}
      {pendingTechs.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-lg shadow-sm">
          <h2 className="text-lg font-bold text-amber-800 mb-2">Perlu Persetujuan ({pendingTechs.length})</h2>
          <div className="space-y-3">
            {pendingTechs.map(pending => (
              <div key={pending.id} className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-amber-100">
                <div>
                  <p className="font-bold text-slate-800">{pending.name}</p>
                  <p className="text-xs text-slate-500">{pending.specialization} - {pending.experience}</p>
                </div>
                <button 
                  onClick={() => { setSelectedTech(pending); setIsReviewOpen(true); }}
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
                <th className="px-6 py-4">Nama Teknisi</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Telepon</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {techs.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{t.name}</td>
                  <td className="px-6 py-4 text-slate-500">{t.email}</td>
                  <td className="px-6 py-4">{t.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(t.id, t.status || 'Aktif')} className="text-slate-400 hover:text-primary">
                      {t.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
              {techs.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">Tidak ada teknisi aktif</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedTech && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedTech}
          onVerify={handleVerify}
        />
      )}
    </div>
  );
};
export default TechniciansPage;
