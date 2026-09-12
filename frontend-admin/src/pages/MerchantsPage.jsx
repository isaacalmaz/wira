import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw, FileSearch, Trash2, Plus, Edit } from 'lucide-react';
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
        .eq('service_type', 'food')
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
        const p = flagsData.features
          .filter(m => m.role === 'merchant' && m.status === 'Pending')
          .map(m => ({
            id: m.id,
            name: m.restaurant_name || m.name,
            owner: m.name,
            phone: m.phone,
            email: m.email,
            address: m.address || 'Mataram, Lombok',
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
      toast.error('Gagal memuat data restoran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
        const pending = pendingMerchants.find(m => m.id === id);
        if (pending) {
          const { error: insertMerchantErr } = await supabase.from('merchants').insert([{
            owner_id: pending.auth_id || null,
            name: pending.name,
            service_type: 'food',
            address: pending.address,
            image: 'https://via.placeholder.com/150',
          }]);
          if (insertMerchantErr) throw insertMerchantErr;
          
          if (pending.auth_id) {
            const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).single();
            if (profileErr && profileErr.code !== 'PGRST116') throw profileErr;
            
            let currentAccess = [];
            let isExisting = false;

            if (userProfile) {
              currentAccess = userProfile.mitra_access || [];
              isExisting = true;
            }

            if (!currentAccess.includes('merchant')) {
              currentAccess.push('merchant');
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
          toast.success(`Restoran ${pending.name} berhasil disetujui dan ditambahkan ke Live Database!`);
        }
      } else {
        toast.success('Pendaftaran ditolak.');
      }
      
      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi restoran');
    }
  };

  const handleDeleteLive = async (id) => {
    if (!window.confirm('Hapus restoran ini dari aplikasi?')) return;
    try {
      const { error, data } = await supabase.from('merchants').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success('Restoran dihapus dari Live Database');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus restoran');
    }
  };

  const filteredLive = liveMerchants.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Restoran</h1>
          <p className="text-sm text-slate-500">Kelola WiraFood dan persetujuan pendaftaran merchant baru.</p>
        </div>
        <button onClick={fetchData} className="p-2 border rounded-xl hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition">
          <RefreshCw size={20} className={`text-slate-600 dark:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setActiveTab('live')} className={`pb-3 font-medium transition ${activeTab === 'live' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'}`}>
          Restoran Aktif ({liveMerchants.length})
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
              <input type="text" placeholder="Cari nama restoran..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary dark:text-white" />
            </div>
            <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-medium" onClick={() => toast('Fitur tambah manual dalam pengembangan')}>
              <Plus size={20} /> Tambah
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-4 font-semibold">Nama Restoran</th>
                  <th className="p-4 font-semibold">Alamat</th>
                  <th className="p-4 font-semibold">Rating</th>
                  <th className="p-4 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredLive.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="p-4 font-bold text-slate-900 dark:text-white">{m.name}</td>
                    <td className="p-4 text-slate-500 truncate max-w-[200px]">{m.address}</td>
                    <td className="p-4 text-amber-500 font-bold">★ {m.rating}</td>
                    <td className="p-4 flex gap-2">
                      <button className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" onClick={() => handleDeleteLive(m.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingMerchants.map(merchant => (
            <div key={merchant.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-primary transition flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{merchant.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      Menunggu Verifikasi
                    </p>
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
          ))}
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
