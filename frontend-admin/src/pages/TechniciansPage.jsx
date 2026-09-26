import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Wrench, Ban, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { ConfirmModal } from '../components/common/UIComponents';

const TechniciansPage = () => {
  const [techs, setTechs] = useState([]);
  const [pendingTechs, setPendingTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (activeErr) throw activeErr;
      if (allUsers) {
        const activeMitras = allUsers.filter(u => {
          if (!u.mitra_access) return false;
          if (Array.isArray(u.mitra_access)) return u.mitra_access.includes('technician');
          if (typeof u.mitra_access === 'string') return u.mitra_access.includes('technician');
          return false;
        });
        setTechs(activeMitras);
      }

      const { data: flagsData, error: flagsErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;
      if (flagsData && Array.isArray(flagsData.features)) {
        const p = flagsData.features.filter(m => m.role === 'technician' && m.status === 'Pending');
        setPendingTechs(p);
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
      if (accept) {
        const pending = pendingTechs.find(m => m.id === id);
        if (pending && pending.auth_id) {
          const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
          if (profileErr) throw profileErr;

          let currentAccess = userProfile?.mitra_access || [];
          if (!currentAccess.includes('technician')) currentAccess.push('technician');

          if (userProfile) {
            const { error: updateErr, data: updatedUser } = await supabase.from('users').update({
              mitra_access: currentAccess,
              status: 'Aktif'
            }).eq('id', pending.auth_id).select();
            if (updateErr) throw updateErr;
            if (!updatedUser || updatedUser.length === 0) {
              throw new Error("Gagal! Akses ditolak oleh sistem keamanan RLS Supabase.");
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
        toast.success('Teknisi berhasil disetujui!');
      } else {
        toast.success('Pendaftaran ditolak.');
      }

      // Only mark the registration handled after the write above actually
      // succeeded - if it threw, the registration stays 'Pending' so it's
      // still visible to retry, instead of looking silently "done" with no
      // real mitra_access grant.
      const { data: flagsData, error: flagsErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;
      if (flagsData && Array.isArray(flagsData.features)) {
        const updatedFeatures = flagsData.features.map(f => f.id === id ? { ...f, status: accept ? 'Active' : 'Rejected', admin_notes: notes || f.admin_notes || '', reviewed_at: new Date().toISOString() } : f);
        const { error: updateFlagsErr, data: updatedFlagsRow } = await supabase.from('feature_flags').update({ features: updatedFeatures }).eq('region', 'mitra_registrations').select();
        if (updateFlagsErr) throw updateFlagsErr;
        if (!updatedFlagsRow || updatedFlagsRow.length === 0) throw new Error('Akses ditolak saat menyimpan status pendaftaran.');
      }

      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi');
    }
  };

  // Step 1: ask for confirmation before blocking/unblocking - this used to
  // fire immediately on one icon click, but blocking a technician
  // mid-job is immediately consequential to them.
  const toggleStatus = (id, currentStatus) => {
    const tech = techs.find(t => t.id === id);
    setBlockTarget({ id, name: tech?.name || 'teknisi ini', currentStatus: currentStatus || 'Aktif' });
  };

  // Step 2: only reached after the operator confirms in the ConfirmModal.
  const confirmToggleStatus = async () => {
    if (!blockTarget) return;
    const { id, currentStatus } = blockTarget;
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
    } finally {
      setBlockTarget(null);
    }
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

      <ConfirmModal
        isOpen={!!blockTarget}
        title={blockTarget?.currentStatus === 'Aktif' ? 'Blokir Teknisi' : 'Aktifkan Kembali Teknisi'}
        message={blockTarget ? (
          blockTarget.currentStatus === 'Aktif'
            ? `Anda akan memblokir "${blockTarget.name}". Teknisi ini tidak akan bisa menerima order jasa servis baru sampai diaktifkan kembali.`
            : `Anda akan mengaktifkan kembali "${blockTarget.name}". Teknisi ini akan bisa menerima order lagi.`
        ) : ''}
        onConfirm={confirmToggleStatus}
        onCancel={() => setBlockTarget(null)}
      />
    </div>
  );
};
export default TechniciansPage;
