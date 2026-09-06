import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw, FileSearch, Filter, ShieldCheck, Phone } from 'lucide-react';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';

const DriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [loading, setLoading] = useState(false);

  // State untuk modal review calon driver
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Ambil data pendaftaran driver murni dari Supabase Cloud & Fallback
  const fetchSupabaseDrivers = async () => {
    setLoading(true);
    let allReal = [];

    // 1. Ambil dari Supabase feature_flags (Cloud sync yang 100% aktif)
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      if (data && Array.isArray(data.features)) {
        const cloudDrivers = data.features
          .filter((d) => d.role === 'driver')
          .map((d) => ({
            id: d.id,
            name: d.name,
            phone: d.phone,
            email: d.email,
            vehicle: d.vehicle || 'Motor',
            plate: d.plate || '-',
            sim_photo: d.sim_photo || null,
            status: d.status || 'Pending',
            created_at: d.created_at,
            rating: 0,
            trips: 0,
            isReal: true,
          }));
        allReal = [...cloudDrivers];
      }
    } catch (err) {
      console.warn('Cloud sync notice:', err);
    }

    // 2. Ambil dari tabel mitra_registrations jika ada
    try {
      const { data } = await supabase
        .from('mitra_registrations')
        .select('*')
        .eq('role', 'driver')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const existingIds = new Set(allReal.map((r) => r.id));
        for (const item of data) {
          if (!existingIds.has(item.id)) {
            allReal.push({
              id: item.id,
              name: item.name,
              phone: item.phone,
              email: item.email,
              vehicle: item.vehicle || 'Motor',
              plate: item.plate || '-',
              sim_photo: item.sim_photo || null,
              status: item.status || 'Pending',
              created_at: item.created_at,
              rating: 0,
              trips: 0,
              isReal: true,
            });
          }
        }
      }
    } catch (e) {}

    // 3. Fallback LocalStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const localDrivers = localData.filter((d) => d.role === 'driver');
      const existingIds = new Set(allReal.map((r) => r.id));
      for (const d of localDrivers) {
        if (!existingIds.has(d.id)) {
          allReal.push({
            id: d.id,
            name: d.name,
            phone: d.phone,
            email: d.email,
            vehicle: d.vehicle || 'Motor',
            plate: d.plate || '-',
            sim_photo: d.sim_photo || null,
            status: d.status || 'Pending',
            created_at: d.created_at,
            rating: 0,
            trips: 0,
            isReal: true,
          });
        }
      }
    } catch (e) {}

    setDrivers(allReal);
    setLoading(false);
  };

  useEffect(() => {
    fetchSupabaseDrivers();

    const channelCloud = supabase
      .channel('realtime-cloud-drivers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            toast.success('Pembaruan data driver diterima dari cloud!', { icon: '🛵' });
            fetchSupabaseDrivers();
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
    
    setDrivers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus, notes } : d))
    );

    // Update di Cloud Supabase feature_flags
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

    // Update di localStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = localData.map((d) => (d.id === id ? { ...d, status: newStatus, notes } : d));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {}

    toast.success(accept ? 'Pengemudi berhasil diverifikasi dan aktif!' : 'Pendaftaran pengemudi ditolak');
  };

  const openReviewModal = (driver) => {
    setSelectedDriver(driver);
    setIsReviewOpen(true);
  };

  const pendingDrivers = drivers.filter((d) => d.status === 'Pending');

  const filteredDrivers = drivers.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm) ||
      d.plate.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchFilter =
      filterStatus === 'Semua' ||
      (filterStatus === 'Menunggu' && d.status === 'Pending') ||
      (filterStatus === 'Aktif' && d.status === 'Active') ||
      (filterStatus === 'Nonaktif' && d.status === 'Inactive');

    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Manajemen Pengemudi (Drivers)
          </h1>
          <p className="text-sm text-slate-500">
            Daftar pengemudi riil yang mendaftar melalui aplikasi Mitra Wira
          </p>
        </div>
        <button
          onClick={fetchSupabaseDrivers}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm w-fit font-medium transition"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Bagian Driver Menunggu Verifikasi */}
      {pendingDrivers.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-600/40 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200 dark:border-slate-700">
            <div>
              <h3 className="text-base font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                Menunggu Verifikasi Berkas ({pendingDrivers.length})
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Ada pengemudi yang baru mendaftar. Klik <strong>Review Berkas</strong> untuk memeriksa foto SIM & menyetujui.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {pendingDrivers.map((driver) => (
              <div
                key={driver.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {driver.name}
                    {driver.sim_photo && (
                      <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded-full font-bold">
                        📸 Ada Foto SIM
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    WA: {driver.phone} • Kendaraan: {driver.vehicle} ({driver.plate})
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openReviewModal(driver)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <FileSearch size={14} /> Review Berkas
                  </button>
                  <button
                    onClick={() => handleVerify(driver.id, true)}
                    className="flex items-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <CheckCircle size={14} /> Setujui
                  </button>
                  <button
                    onClick={() => handleVerify(driver.id, false)}
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

      {/* Tabel Keseluruhan Driver */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari nama, nomor WA, atau plat nomor..."
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

        {filteredDrivers.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Data Pengemudi
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Calon driver yang mendaftar melalui aplikasi Mitra Wira akan langsung muncul di sini secara otomatis tanpa perlu refresh.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Nama / Kontak
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Kendaraan
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Dokumen SIM
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredDrivers.map((driver) => (
                  <tr
                    key={driver.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {driver.name}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">{driver.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{driver.vehicle}</div>
                      <div className="text-slate-500 text-xs font-mono">{driver.plate}</div>
                    </td>
                    <td className="px-6 py-4">
                      {driver.sim_photo ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                          ✓ Foto Terlampir
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Belum ada foto</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={driver.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openReviewModal(driver)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition"
                          title="Buka detail berkas pendaftaran"
                        >
                          <Eye size={15} /> Review
                        </button>
                        <button
                          onClick={() => handleVerify(driver.id, driver.status !== 'Active', 'Diubah secara manual dari tabel')}
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition border ${
                            driver.status === 'Active'
                              ? 'text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/30'
                              : 'text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800/50 dark:hover:bg-green-900/30'
                          }`}
                        >
                          {driver.status === 'Active' ? 'Blokir' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
      </div>

      {/* Modal Review Berkas Driver */}
      <MitraReviewModal
        isOpen={isReviewOpen}
        mitra={selectedDriver}
        onClose={() => setIsReviewOpen(false)}
        onVerify={handleVerify}
      />
    </div>
  );
};

export default DriversPage;
