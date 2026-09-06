import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw, FileSearch, Filter, ShieldCheck } from 'lucide-react';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';

const TechniciansPage = () => {
  const [technicians, setTechnicians] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua');
  const [loading, setLoading] = useState(false);

  // State untuk modal review calon teknisi
  const [selectedTech, setSelectedTech] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const fetchSupabaseTechs = async () => {
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
        const cloudTechs = data.features
          .filter((t) => t.role === 'technician')
          .map((t) => ({
            id: t.id,
            name: t.name,
            phone: t.phone,
            email: t.email,
            specialization: t.specialization || 'Jasa Umum',
            experience: t.experience || 1,
            sim_photo: t.sim_photo || null,
            status: t.status || 'Pending',
            created_at: t.created_at,
            rating: 0,
            totalJobs: 0,
            isReal: true,
          }));
        allReal = [...cloudTechs];
      }
    } catch (err) {
      console.warn('Cloud technician sync notice:', err);
    }

    // 2. Ambil dari tabel mitra_registrations jika ada
    try {
      const { data } = await supabase
        .from('mitra_registrations')
        .select('*')
        .eq('role', 'technician')
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
              specialization: item.specialization || 'Jasa Umum',
              experience: item.experience || 1,
              sim_photo: item.sim_photo || null,
              status: item.status || 'Pending',
              created_at: item.created_at,
              rating: 0,
              totalJobs: 0,
              isReal: true,
            });
          }
        }
      }
    } catch (e) {}

    // 3. Fallback LocalStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const localTechs = localData.filter((t) => t.role === 'technician');
      const existingIds = new Set(allReal.map((r) => r.id));
      for (const t of localTechs) {
        if (!existingIds.has(t.id)) {
          allReal.push({
            id: t.id,
            name: t.name,
            phone: t.phone,
            email: t.email,
            specialization: t.specialization || 'Jasa Umum',
            experience: t.experience || 1,
            sim_photo: t.sim_photo || null,
            status: t.status || 'Pending',
            created_at: t.created_at,
            rating: 0,
            totalJobs: 0,
            isReal: true,
          });
        }
      }
    } catch (e) {}

    setTechnicians(allReal);
    setLoading(false);
  };

  useEffect(() => {
    fetchSupabaseTechs();

    const channelCloud = supabase
      .channel('realtime-cloud-technicians')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            toast.success('Pembaruan data teknisi diterima dari cloud!', { icon: '🔧' });
            fetchSupabaseTechs();
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
    
    setTechnicians((prev) =>
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

    toast.success(accept ? 'Teknisi berhasil diverifikasi & aktif!' : 'Teknisi ditolak');
  };

  const openReviewModal = (tech) => {
    setSelectedTech({
      ...tech,
      role: 'technician',
    });
    setIsReviewOpen(true);
  };

  const pending = technicians.filter((t) => t.status === 'Pending');

  const filtered = technicians.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.specialization.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.phone.includes(searchTerm);

    const matchFilter =
      filterStatus === 'Semua' ||
      (filterStatus === 'Menunggu' && t.status === 'Pending') ||
      (filterStatus === 'Aktif' && t.status === 'Active') ||
      (filterStatus === 'Nonaktif' && t.status === 'Inactive');

    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Manajemen Teknisi (WiraService & Pool)
          </h1>
          <p className="text-sm text-slate-500">
            Daftar penyedia jasa AC, listrik, pompa air, tukang, & kolam renang
          </p>
        </div>
        <button
          onClick={fetchSupabaseTechs}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm w-fit font-medium transition"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-600/40 p-5 rounded-2xl shadow-sm">
          <h3 className="text-base font-bold text-amber-900 dark:text-amber-200 mb-1">
            Teknisi Menunggu Verifikasi ({pending.length})
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
            Klik tombol <strong>Review Berkas</strong> untuk memeriksa sertifikasi/keahlian teknisi dan menyetujui.
          </p>
          <div className="flex flex-col gap-3">
            {pending.map((tech) => (
              <div
                key={tech.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-base">
                    {tech.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Keahlian: <strong className="text-primary">{tech.specialization}</strong> • Pengalaman: {tech.experience} Thn • WA: {tech.phone}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => openReviewModal(tech)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <FileSearch size={14} /> Review Berkas
                  </button>
                  <button
                    onClick={() => handleVerify(tech.id, true)}
                    className="flex items-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl transition shadow-sm"
                  >
                    <CheckCircle size={14} /> Terima
                  </button>
                  <button
                    onClick={() => handleVerify(tech.id, false)}
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
              placeholder="Cari nama, spesialisasi, atau no WA..."
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

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Data Teknisi
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Mitra teknisi yang mendaftar melalui aplikasi Mitra Wira akan langsung muncul di sini secara otomatis.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Nama Teknisi
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Kontak HP
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Spesialisasi Jasa
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Pengalaman
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((tech) => (
                  <tr
                    key={tech.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {tech.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{tech.phone}</td>
                    <td className="px-6 py-4 font-semibold text-primary">
                      {tech.specialization}
                    </td>
                    <td className="px-6 py-4 dark:text-white">{tech.experience} Tahun</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={tech.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openReviewModal(tech)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition"
                          title="Buka detail berkas pendaftaran"
                        >
                          <Eye size={15} /> Review
                        </button>
                        <button
                          onClick={() => handleVerify(tech.id, tech.status !== 'Active', 'Diubah secara manual dari tabel')}
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition border ${
                            tech.status === 'Active'
                              ? 'text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/30'
                              : 'text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800/50 dark:hover:bg-green-900/30'
                          }`}
                        >
                          {tech.status === 'Active' ? 'Blokir' : 'Aktifkan'}
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

      {/* Modal Review Teknisi */}
      <MitraReviewModal
        isOpen={isReviewOpen}
        mitra={selectedTech}
        onClose={() => setIsReviewOpen(false)}
        onVerify={handleVerify}
      />
    </div>
  );
};

export default TechniciansPage;
