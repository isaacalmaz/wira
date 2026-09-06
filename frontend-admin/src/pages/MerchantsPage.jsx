import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw, FileSearch, Filter, ShieldCheck } from 'lucide-react';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';

const MerchantsPage = () => {
  const [merchants, setMerchants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [loading, setLoading] = useState(false);

  // State untuk modal review calon merchant
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const fetchSupabaseMerchants = async () => {
    setLoading(true);
    let allReal = [];

    // 1. Ambil dari Supabase feature_flags
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        const cloudMerchants = data.features
          .filter((m) => m.role === 'merchant')
          .map((m) => ({
            id: m.id,
            name: m.restaurant_name || m.name,
            owner: m.name,
            phone: m.phone,
            email: m.email,
            address: m.address || 'Mataram, Lombok',
            sim_photo: m.sim_photo || null,
            restaurants: 1,
            status: m.status || 'Pending',
            created_at: m.created_at,
            joinDate: 'Hari ini',
            isReal: true,
          }));
        allReal = [...cloudMerchants];
      }
    } catch (err) {
      console.warn('Cloud merchant sync notice:', err);
    }

    // 2. Ambil dari tabel mitra_registrations jika ada
    try {
      const { data } = await supabase
        .from('mitra_registrations')
        .select('*')
        .eq('role', 'merchant')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const existingIds = new Set(allReal.map((r) => r.id));
        for (const item of data) {
          if (!existingIds.has(item.id)) {
            allReal.push({
              id: item.id,
              name: item.restaurant_name || item.name,
              owner: item.name,
              phone: item.phone,
              email: item.email,
              address: item.address || 'Mataram, Lombok',
              sim_photo: item.sim_photo || null,
              restaurants: 1,
              status: item.status || 'Pending',
              created_at: item.created_at,
              joinDate: 'Hari ini',
              isReal: true,
            });
          }
        }
      }
    } catch (e) {}

    // 3. Fallback LocalStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const localMerchants = localData.filter((m) => m.role === 'merchant');
      const existingIds = new Set(allReal.map((r) => r.id));
      for (const m of localMerchants) {
        if (!existingIds.has(m.id)) {
          allReal.push({
            id: m.id,
            name: m.restaurant_name || m.name,
            owner: m.name,
            phone: m.phone,
            email: m.email,
            address: m.address || 'Mataram, Lombok',
            sim_photo: m.sim_photo || null,
            restaurants: 1,
            status: m.status || 'Pending',
            created_at: m.created_at,
            joinDate: 'Hari ini',
            isReal: true,
          });
        }
      }
    } catch (e) {}

    setMerchants(allReal);
    setLoading(false);
  };

  useEffect(() => {
    fetchSupabaseMerchants();

    const channelCloud = supabase
      .channel('realtime-cloud-merchants')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            toast.success('Pembaruan data merchant diterima dari cloud!', { icon: '🍔' });
            fetchSupabaseMerchants();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelCloud);
    };
  }, []);

  const handleVerify = async (id, accept, notes = '') => {
    const newStatus = accept ? 'Active' : 'Inactive';
    
    setMerchants((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus, notes } : d))
    );

    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('id, features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        const updated = data.features.map((m) =>
          m.id === id ? { ...m, status: newStatus, notes } : m
        );
        await supabase
          .from('feature_flags')
          .update({ features: updated, updated_at: new Date().toISOString() })
          .eq('region', 'mitra_registrations');
      }
    } catch (e) {}

    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = localData.map((d) => (d.id === id ? { ...d, status: newStatus, notes } : d));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {}

    toast.success(accept ? 'Merchant restoran diverifikasi & aktif!' : 'Merchant ditolak');
  };

  const openReviewModal = (merchant) => {
    setSelectedMerchant({
      ...merchant,
      role: 'merchant',
      restaurant_name: merchant.name,
      name: merchant.owner || merchant.name,
    });
    setIsReviewOpen(true);
  };

  const pendingMerchants = merchants.filter((m) => m.status === 'Pending');

  const filteredMerchants = merchants.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.phone.includes(searchTerm);

    const matchFilter =
      filterStatus === 'Semua' ||
      (filterStatus === 'Menunggu' && m.status === 'Pending') ||
      (filterStatus === 'Aktif' && m.status === 'Active') ||
      (filterStatus === 'Nonaktif' && m.status === 'Inactive');

    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Manajemen Merchant (WiraFood)
          </h1>
          <p className="text-sm text-slate-500">
            Daftar restoran, warung kuliner Lombok, dan mitra F&B terdaftar
          </p>
        </div>
        <button
          onClick={fetchSupabaseMerchants}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm w-fit font-medium transition"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {pendingMerchants.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-600/40 p-5 rounded-2xl shadow-sm">
          <h3 className="text-base font-bold text-amber-900 dark:text-amber-200 mb-1">
            Merchant Menunggu Verifikasi ({pendingMerchants.length})
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            Klik tombol <strong>Review Berkas</strong> untuk memeriksa rincian warung kuliner dan menyetujui.
          </p>
          <div className="flex flex-col gap-3">
            {pendingMerchants.map((merchant) => (
              <div
                key={merchant.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-base">
                    {merchant.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pemilik: {merchant.owner} • WA: {merchant.phone} • Lokasi: {merchant.address}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openReviewModal(merchant)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <FileSearch size={14} /> Review Berkas
                  </button>
                  <button
                    onClick={() => handleVerify(merchant.id, true)}
                    className="flex items-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <CheckCircle size={14} /> Terima
                  </button>
                  <button
                    onClick={() => handleVerify(merchant.id, false)}
                    className="flex items-center gap-1 text-xs font-semibold bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 dark:bg-slate-700 dark:hover:bg-red-900/30 dark:text-slate-300 dark:hover:text-red-400 px-3 py-2 rounded-xl transition border border-slate-200 dark:border-slate-600"
                  >
                    <XCircle size={14} /> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari nama restoran, pemilik, atau kontak..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2 w-full text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-2 text-sm"
            >
              <option value="Semua">Semua Status</option>
              <option value="Menunggu">Menunggu Verifikasi</option>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif / Ditolak</option>
            </select>
          </div>
        </div>

        {filteredMerchants.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Data Merchant
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Mitra kuliner yang mendaftar melalui aplikasi Mitra Wira akan langsung muncul di sini secara otomatis.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Bisnis / Restoran
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Pemilik & Kontak
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Alamat
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredMerchants.map((merchant) => (
                  <tr
                    key={merchant.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {merchant.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-800 dark:text-slate-200 font-medium">{merchant.owner}</div>
                      <div className="text-slate-500 text-xs">{merchant.phone}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs">
                      {merchant.address}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={merchant.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openReviewModal(merchant)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition"
                        title="Review data merchant"
                      >
                        <Eye size={15} /> Review Data
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>

      {/* Modal Review Merchant */}
      <MitraReviewModal
        isOpen={isReviewOpen}
        mitra={selectedMerchant}
        onClose={() => setIsReviewOpen(false)}
        onVerify={handleVerify}
      />
    </div>
  );
};

export default MerchantsPage;
