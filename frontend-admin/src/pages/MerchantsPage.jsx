import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { mockMerchants } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const MerchantsPage = () => {
  const [merchants, setMerchants] = useState(mockMerchants);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Ambil data pendaftaran merchant dari Supabase Cloud & Fallback
  const fetchSupabaseMerchants = async () => {
    setLoading(true);
    let allReal = [];

    // 1. Ambil dari Supabase feature_flags (Cloud sync yang 100% aktif & terbuka)
    try {
      const { data, error } = await supabase
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
            restaurants: 1,
            status: m.status || 'Pending',
            joinDate: 'Hari ini',
            isReal: true,
          }));
        allReal = [...cloudMerchants];
      }
    } catch (err) {
      console.warn('Cloud merchant sync notice:', err);
    }

    // 2. Ambil juga dari tabel mitra_registrations jika ada
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
              restaurants: 1,
              status: item.status || 'Pending',
              joinDate: 'Hari ini',
              isReal: true,
            });
          }
        }
      }
    } catch (e) {}

    // 3. Fallback LocalStorage jika dalam satu browser/tab
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
            restaurants: 1,
            status: m.status || 'Pending',
            joinDate: 'Hari ini',
            isReal: true,
          });
        }
      }
    } catch (e) {}

    setMerchants((prev) => {
      const realIds = new Set(allReal.map((r) => r.id));
      const onlyMock = prev.filter((p) => !realIds.has(p.id) && !p.isReal);
      return [...allReal, ...onlyMock];
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchSupabaseMerchants();

    // 1. Sinkronisasi Real-time Supabase Cloud (feature_flags)
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

    // 2. Sinkronisasi Antar-Tab (Broadcast & Storage Event)
    const handleStorageChange = (e) => {
      if (e.key === 'wira_mitra_registrations') {
        fetchSupabaseMerchants();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    let bc;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('wira_mitra_channel');
      bc.onmessage = (msg) => {
        if (msg.data && msg.data.type === 'NEW_MITRA' && msg.data.data.role === 'merchant') {
          toast.success(`Merchant Restoran baru mendaftar: ${msg.data.data.restaurant_name || msg.data.data.name}!`, {
            icon: '🍔',
            duration: 8000,
          });
          fetchSupabaseMerchants();
        }
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (bc) bc.close();
      supabase.removeChannel(channelCloud);
    };
  }, []);

  const pendingMerchants = merchants.filter((m) => m.status === 'Pending');
  const filteredMerchants = merchants.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.owner.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVerify = async (id, accept) => {
    const newStatus = accept ? 'Active' : 'Inactive';
    
    // Update local state instan
    setMerchants((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
    );

    // Update di Cloud Supabase feature_flags
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        const updated = data.features.map((m) =>
          m.id === id ? { ...m, status: newStatus } : m
        );
        await supabase
          .from('feature_flags')
          .upsert({ region: 'mitra_registrations', features: updated }, { onConflict: 'region' });
      }
    } catch (e) {
      console.warn('Update cloud notice:', e);
    }

    // Update di localStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = localData.map((d) => (d.id === id ? { ...d, status: newStatus } : d));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {}

    // Update di mitra_registrations jika tabel ada
    try {
      await supabase.from('mitra_registrations').update({ status: newStatus }).eq('id', id);
    } catch (e) {}

    toast.success(accept ? 'Merchant restoran diverifikasi & aktif!' : 'Merchant ditolak');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Manajemen Merchant (WiraFood)
        </h1>
        <button
          onClick={fetchSupabaseMerchants}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {pendingMerchants.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-3">
            Menunggu Verifikasi ({pendingMerchants.length})
          </h3>
          <div className="flex flex-col gap-3">
            {pendingMerchants.map((merchant) => (
              <div
                key={merchant.id}
                className="flex items-center justify-between bg-white dark:bg-slate-800 p-3.5 rounded shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    {merchant.name}
                    {merchant.isReal && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                        Pendaftar Baru (Live)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Pemilik: {merchant.owner} | {merchant.phone}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(merchant.id, true)}
                    className="flex items-center gap-1 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded hover:bg-green-200 transition"
                  >
                    <CheckCircle size={16} /> Terima
                  </button>
                  <button
                    onClick={() => handleVerify(merchant.id, false)}
                    className="flex items-center gap-1 text-sm bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded hover:bg-red-200 transition"
                  >
                    <XCircle size={16} /> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari nama bisnis atau pemilik..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2 w-full"
            />
          </div>
        </div>

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
                  Jumlah Gerai
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Bergabung
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredMerchants.map((merchant) => (
                <tr
                  key={merchant.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                      {merchant.name}
                      {merchant.isReal && (
                        <span className="w-2 h-2 rounded-full bg-green-500" title="Live Database"></span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-slate-800 dark:text-slate-200">{merchant.owner}</div>
                    <div className="text-slate-500 text-xs">{merchant.phone}</div>
                  </td>
                  <td className="px-6 py-4 dark:text-white">{merchant.restaurants}</td>
                  <td className="px-6 py-4 text-slate-500">{merchant.joinDate}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={merchant.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      className="text-primary hover:text-cyan-700 p-2"
                      title="Detail"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>
    </div>
  );
};

export default MerchantsPage;
