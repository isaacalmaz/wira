import { useState, useEffect } from 'react';
import { Search, RefreshCw, FileSearch, Trash2, Plus } from 'lucide-react';
import { supabase } from '../config/supabase';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';

const MerchantsPage = () => {
  const [liveMerchants, setLiveMerchants] = useState([]);
  const [pendingMerchants, setPendingMerchants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'pending'

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: merchantsData, error: merchantsErr } = await supabase
        .from('merchants')
        .select('*')
        .in('service_type', ['food', 'villa', 'WiraFood', 'WiraVilla'])
        .order('created_at', { ascending: false });
      
      if (merchantsErr) throw merchantsErr;
      setLiveMerchants(merchantsData || []);

      const { data: flagsData, error: flagsErr } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (flagsErr && flagsErr.code !== 'PGRST116') throw flagsErr;

      if (flagsData && Array.isArray(flagsData.features)) {
        // RegisterPage.jsx's step-1 Villa radio writes the pending
        // registration's role as the literal 'villa' (not 'merchant') now
        // that Villa is its own top-level choice - without matching both
        // values here, a brand-new Villa registration never appears in any
        // admin queue at all and can never be approved.
        const p = flagsData.features
          .filter(m => (m.role === 'merchant' || m.role === 'villa') && m.status === 'Pending')
          .map(m => ({
            id: m.id,
            role: 'merchant',
            name: m.restaurant_name || m.name,
            owner: m.name,
            phone: m.phone,
            email: m.email,
            address: m.address || 'Mataram, Lombok',
            service_type: m.service_type || 'food',
            sim_photo: m.sim_photo,
            ktp_photo: m.ktp_photo,
            selfie_photo: m.selfie_photo,
            vehicle_plate: m.vehicle_plate,
            vehicle_type: m.vehicle_type,
            status: m.status,
            date: m.date
          }));
        setPendingMerchants(p);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data merchant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerify = async (id, accept, notes = '') => {
    try {
      if (accept) {
        const pending = pendingMerchants.find(m => m.id === id);
        if (pending) {
          // public.users must exist BEFORE merchants (merchants.owner_id has
          // a foreign key to users.id) - this used to insert merchants first,
          // which threw a foreign-key violation for every brand-new
          // registrant (no existing users row yet, the normal case for a
          // first-time mitra signup). Because feature_flags status was
          // updated to 'Active' separately with no rollback on failure, the
          // registration looked "approved" in the queue while no merchants
          // row and no mitra_access grant ever actually happened.
          if (pending.auth_id) {
            const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
            if (profileErr) throw profileErr;

            // Villa is now its own login portal, separate from merchant
            // (Restoran) - grant the matching mitra_access value so the
            // account actually lands in the right portal.
            const isVilla = pending.service_type === 'villa' || pending.service_type === 'WiraVilla';
            const grantRole = isVilla ? 'villa' : 'merchant';
            let currentAccess = userProfile?.mitra_access || [];
            if (!currentAccess.includes(grantRole)) currentAccess.push(grantRole);

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

          const { error: insertMerchantErr } = await supabase.from('merchants').insert([{
            owner_id: pending.auth_id || null,
            name: pending.name,
            service_type: pending.service_type || 'food',
            address: pending.address,
            image: 'https://via.placeholder.com/150',
          }]);
          if (insertMerchantErr) throw insertMerchantErr;

          toast.success(`${pending.name} berhasil disetujui dan ditambahkan ke Live Database!`);
        }
      } else {
        toast.success('Pendaftaran ditolak.');
      }

      // Only mark the registration handled (Active/Rejected) after the
      // writes above actually succeeded - if they threw, the registration
      // stays 'Pending' so it's still visible to retry, instead of looking
      // silently "done" with nothing actually granted.
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
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi merchant');
    }
  };

  const handleDeleteLive = async (id) => {
    if (!window.confirm('Hapus merchant ini dari aplikasi?')) return;
    try {
      const { error, data } = await supabase.from('merchants').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success('Merchant dihapus dari Live Database');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus merchant');
    }
  };

  const filteredLive = liveMerchants.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Merchant</h1>
          <p className="text-sm text-slate-500">Kelola WiraFood & WiraVilla dan persetujuan pendaftaran merchant baru.</p>
        </div>
        <button onClick={fetchData} className="p-2 border rounded-xl hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition">
          <RefreshCw size={20} className={`text-slate-600 dark:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setActiveTab('live')} className={`pb-3 font-medium transition ${activeTab === 'live' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'}`}>
          Merchant Aktif ({liveMerchants.length})
        </button>
        <button onClick={() => setActiveTab('pending')} className={`pb-3 font-medium transition flex items-center gap-2 ${activeTab === 'pending' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>
          Menunggu Verifikasi 
          {pendingMerchants.length > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs">{pendingMerchants.length}</span>}
        </button>
      </div>

      {activeTab === 'live' ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
              <input type="text" placeholder="Cari nama merchant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary dark:text-white" />
            </div>
            <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-medium" onClick={() => toast('Fitur tambah manual dalam pengembangan')}>
              <Plus size={20} /> Tambah
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-4 font-semibold">Nama</th>
                  <th className="p-4 font-semibold">Jenis</th>
                  <th className="p-4 font-semibold">Alamat</th>
                  <th className="p-4 font-semibold">Rating</th>
                  <th className="p-4 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredLive.map(m => {
                  const isVilla = m.service_type === 'villa' || m.service_type === 'WiraVilla';
                  return (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="p-4 font-bold text-slate-900 dark:text-white">{m.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${isVilla ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700'}`}>
                        {isVilla ? 'WiraVilla' : 'WiraFood'}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 truncate max-w-[200px]">{m.address}</td>
                    <td className="p-4 text-amber-500 font-bold">★ {m.rating}</td>
                    <td className="p-4 flex gap-2">
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" onClick={() => handleDeleteLive(m.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingMerchants.map(merchant => {
            const isVilla = merchant.service_type === 'villa' || merchant.service_type === 'WiraVilla';
            return (
            <div key={merchant.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-primary transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{merchant.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isVilla ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700'}`}>
                        {isVilla ? 'WiraVilla' : 'WiraFood'}
                      </span>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        Menunggu Verifikasi
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 mb-5">
                  <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Pemilik:</strong> {merchant.owner}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300"><strong>HP:</strong> {merchant.phone}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 truncate"><strong>Lokasi:</strong> {merchant.address}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedMerchant(merchant); setIsReviewOpen(true); }} className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white py-2.5 rounded-xl text-sm font-bold transition">
                <FileSearch size={16} /> Review Berkas
              </button>
            </div>
            );
          })}
          {pendingMerchants.length === 0 && (
            <div className="col-span-full p-10 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              Tidak ada pendaftaran merchant baru saat ini.
            </div>
          )}
        </div>
      )}

      {selectedMerchant && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedMerchant}
          onVerify={handleVerify}
        />
      )}
    </div>
  );
};
export default MerchantsPage;
