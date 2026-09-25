import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Car, Package, Utensils, Ban, CheckCircle, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { ConfirmModal } from '../components/common/UIComponents';

// Driver is now one unified mitra_access role covering Ride/Kurir/Makanan
// together (migrations/0033 collapsed the earlier 'driver'/'courier' split
// back into one) - which of those job types a given driver actually
// receives is decided by their own job_type_preferences, not by a second
// mitra_access tag anymore.
const hasAccess = (mitraAccess, role) => {
  if (!mitraAccess) return false;
  if (Array.isArray(mitraAccess)) return mitraAccess.includes(role);
  if (typeof mitraAccess === 'string') return mitraAccess.includes(role);
  return false;
};

const hasJobType = (jobTypePreferences, jobType) => Array.isArray(jobTypePreferences) && jobTypePreferences.includes(jobType);

const DriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (activeErr) throw activeErr;
      if (allUsers) {
        const activeMitras = allUsers.filter(u => hasAccess(u.mitra_access, 'driver'));
        setDrivers(activeMitras);
      }

      const { data: flagsData, error: flagsErr } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').maybeSingle();
      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;
      if (flagsData && Array.isArray(flagsData.features)) {
        // The merged registration form (RegisterPage.jsx) only ever writes
        // role: 'driver' now - 'courier' is matched defensively here purely
        // for any pending registration submitted before this migration
        // shipped tonight, so it still surfaces in the approval queue
        // instead of silently vanishing.
        const p = flagsData.features.filter(m => (m.role === 'driver' || m.role === 'courier') && m.status === 'Pending');
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
      if (accept) {
        const pending = pendingDrivers.find(m => m.id === id);
        if (pending && pending.auth_id) {
          const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
          if (profileErr) throw profileErr;

          // Always grant the single unified 'driver' role now (migrations/0033
          // collapsed the earlier driver/courier split) - a pre-existing
          // pending record from before tonight's change may still literally
          // say role: 'courier', but it still grants 'driver' access, not a
          // separate 'courier' tag that no longer means anything.
          let currentAccess = userProfile?.mitra_access || [];
          if (!currentAccess.includes('driver')) currentAccess.push('driver');

          // Carry vehicle_type/job_type_preferences from the registration
          // payload into the granted user row - only set them if the
          // account doesn't already have a value (an existing driver who
          // self-served a preference change in Settings before approval,
          // e.g. re-registering, should not be silently reset).
          const grantedVehicleType = userProfile?.vehicle_type || pending.vehicle_type || 'motor';
          const grantedJobPrefs = (Array.isArray(userProfile?.job_type_preferences) && userProfile.job_type_preferences.length > 0)
            ? userProfile.job_type_preferences
            : (Array.isArray(pending.job_type_preferences) ? pending.job_type_preferences : ['ride', 'send', 'food']);

          if (userProfile) {
            const { error: updateErr, data: updatedUser } = await supabase.from('users').update({
              mitra_access: currentAccess,
              vehicle_type: grantedVehicleType,
              job_type_preferences: grantedJobPrefs,
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
              mitra_access: currentAccess,
              vehicle_type: grantedVehicleType,
              job_type_preferences: grantedJobPrefs
            }]);
            if (insertErr) throw insertErr;
          }
        }
        toast.success('Driver berhasil disetujui!');
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
  // fire immediately on one icon click, but blocking a driver mid-shift is
  // immediately consequential to them (an active ride/delivery, income).
  const toggleStatus = (id, currentStatus) => {
    const driver = drivers.find(d => d.id === id);
    setBlockTarget({ id, name: driver?.name || 'driver ini', currentStatus: currentStatus || 'Aktif' });
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="text-primary"/> Manajemen Driver & Kurir</h1>
          <p className="text-sm text-slate-500">Daftar Mitra Pengemudi (Ride) & Kurir (Send) Wira</p>
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
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-800">{pending.name}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                      Driver{pending.vehicle_type === 'mobil' ? ' (Mobil)' : ''}
                    </span>
                  </div>
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
                <th className="px-6 py-4">Layanan</th>
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
                  <td className="px-6 py-4">
                    <div className="flex gap-1.5">
                      {hasJobType(d.job_type_preferences, 'ride') && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                          <Car size={11} /> Ride
                        </span>
                      )}
                      {hasJobType(d.job_type_preferences, 'send') && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                          <Package size={11} /> Kurir
                        </span>
                      )}
                      {hasJobType(d.job_type_preferences, 'food') && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                          <Utensils size={11} /> Makanan
                        </span>
                      )}
                      <span className="flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                        {d.vehicle_type === 'mobil' ? 'Mobil' : 'Motor'}
                      </span>
                    </div>
                  </td>
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
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">Tidak ada pengemudi atau kurir aktif</td>
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

      <ConfirmModal
        isOpen={!!blockTarget}
        title={blockTarget?.currentStatus === 'Aktif' ? 'Blokir Driver' : 'Aktifkan Kembali Driver'}
        message={blockTarget ? (
          blockTarget.currentStatus === 'Aktif'
            ? `Anda akan memblokir "${blockTarget.name}". Driver ini tidak akan bisa menerima order baru sampai diaktifkan kembali - jika sedang dalam perjalanan/order aktif, order itu tidak otomatis dibatalkan.`
            : `Anda akan mengaktifkan kembali "${blockTarget.name}". Driver ini akan bisa menerima order lagi.`
        ) : ''}
        onConfirm={confirmToggleStatus}
        onCancel={() => setBlockTarget(null)}
      />
    </div>
  );
};
export default DriversPage;
