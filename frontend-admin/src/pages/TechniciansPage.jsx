import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { mockTechnicians } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const TechniciansPage = () => {
  const [technicians, setTechnicians] = useState(mockTechnicians);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Ambil data teknisi dari Supabase
  const fetchSupabaseTechs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mitra_registrations')
        .select('*')
        .eq('role', 'technician')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const formatted = data.map((t) => ({
          id: t.id,
          name: t.name,
          phone: t.phone,
          specialization: t.specialization || 'Jasa Umum',
          status: t.status || 'Pending',
          rating: 0,
          totalJobs: 0,
          isReal: true,
        }));

        setTechnicians((prev) => {
          const existingRealIds = new Set(formatted.map((f) => f.id));
          const onlyMock = prev.filter((p) => !existingRealIds.has(p.id) && !p.isReal);
          return [...formatted, ...onlyMock];
        });
      }
    } catch (err) {
      console.log('Using local technicians fallback', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupabaseTechs();

    // Notifikasi Real-time: Ketika ada teknisi baru mendaftar
    const channel = supabase
      .channel('realtime-admin-technicians')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mitra_registrations' },
        (payload) => {
          if (payload.new && payload.new.role === 'technician') {
            toast.success(`Teknisi baru mendaftar: ${payload.new.name}!`, {
              icon: '🔧',
              duration: 8000,
            });
            const newTech = {
              id: payload.new.id,
              name: payload.new.name,
              phone: payload.new.phone,
              specialization: payload.new.specialization || 'Jasa Umum',
              status: payload.new.status || 'Pending',
              rating: 0,
              totalJobs: 0,
              isReal: true,
            };
            setTechnicians((prev) => [newTech, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const pending = technicians.filter((t) => t.status === 'Pending');
  const filtered = technicians.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.specialization.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVerify = async (id, accept) => {
    const newStatus = accept ? 'Active' : 'Inactive';
    setTechnicians((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );

    try {
      await supabase
        .from('mitra_registrations')
        .update({ status: newStatus })
        .eq('id', id);
    } catch (err) {
      console.log('Update local only', err);
    }

    toast.success(accept ? 'Teknisi berhasil diverifikasi!' : 'Teknisi ditolak');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Manajemen Teknisi (WiraService)
        </h1>
        <button
          onClick={fetchSupabaseTechs}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {pending.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-3">
            Menunggu Verifikasi ({pending.length})
          </h3>
          <div className="flex flex-col gap-3">
            {pending.map((tech) => (
              <div
                key={tech.id}
                className="flex items-center justify-between bg-white dark:bg-slate-800 p-3.5 rounded shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    {tech.name}
                    {tech.isReal && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                        Pendaftar Baru (Live)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Spesialisasi: {tech.specialization} | {tech.phone}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(tech.id, true)}
                    className="flex items-center gap-1 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded hover:bg-green-200 transition"
                  >
                    <CheckCircle size={16} /> Terima
                  </button>
                  <button
                    onClick={() => handleVerify(tech.id, false)}
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
              placeholder="Cari nama atau spesialisasi..."
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
                  Nama Teknisi
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Kontak HP
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Spesialisasi Jasa
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Rating
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Pekerjaan
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((tech) => (
                <tr
                  key={tech.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                      {tech.name}
                      {tech.isReal && (
                        <span className="w-2 h-2 rounded-full bg-green-500" title="Live Database"></span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{tech.phone}</td>
                  <td className="px-6 py-4 font-semibold text-primary">
                    {tech.specialization}
                  </td>
                  <td className="px-6 py-4 dark:text-white">
                    {tech.rating > 0 ? `⭐ ${tech.rating}` : '-'}
                  </td>
                  <td className="px-6 py-4 dark:text-white">{tech.totalJobs} order</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={tech.status} />
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

export default TechniciansPage;
