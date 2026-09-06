import { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { mockDrivers } from '../data/mockData2';
import { StatusBadge, Pagination } from '../components/common/UIComponents';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';

const DriversPage = () => {
  const [drivers, setDrivers] = useState(mockDrivers);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Ambil data pendaftaran driver dari LocalStorage & Supabase
  const fetchSupabaseDrivers = async () => {
    setLoading(true);
    let allReal = [];

    // 1. Ambil dari LocalStorage untuk pembaruan instan
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const localDrivers = localData
        .filter((d) => d.role === 'driver')
        .map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          vehicle: d.vehicle || 'Motor',
          plate: d.plate || '-',
          status: d.status || 'Pending',
          rating: 0,
          trips: 0,
          isReal: true,
        }));
      allReal = [...localDrivers];
    } catch (e) {
      console.warn('Local storage read notice:', e);
    }

    // 2. Ambil dari Supabase
    try {
      const { data, error } = await supabase
        .from('mitra_registrations')
        .select('*')
        .eq('role', 'driver')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const formatted = data.map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          vehicle: d.vehicle || 'Motor',
          plate: d.plate || '-',
          status: d.status || 'Pending',
          rating: 0,
          trips: 0,
          isReal: true,
        }));

        const existingIds = new Set(allReal.map((r) => r.id));
        for (const item of formatted) {
          if (!existingIds.has(item.id)) {
            allReal.push(item);
          }
        }
      }
    } catch (err) {
      console.log('Supabase drivers notice:', err);
    } finally {
      setDrivers((prev) => {
        const realIds = new Set(allReal.map((r) => r.id));
        const onlyMock = prev.filter((p) => !realIds.has(p.id) && !p.isReal);
        return [...allReal, ...onlyMock];
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupabaseDrivers();

    // 1. Sinkronisasi Antar-Tab (Broadcast & Storage Event)
    const handleStorageChange = (e) => {
      if (e.key === 'wira_mitra_registrations') {
        fetchSupabaseDrivers();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    let bc;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('wira_mitra_channel');
      bc.onmessage = (msg) => {
        if (msg.data && msg.data.type === 'NEW_MITRA' && msg.data.data.role === 'driver') {
          toast.success(`Driver baru mendaftar: ${msg.data.data.name}!`, {
            icon: '🛵',
            duration: 8000,
          });
          fetchSupabaseDrivers();
        }
      };
    }

    // 2. Notifikasi Real-time Supabase
    const channel = supabase
      .channel('realtime-admin-drivers')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mitra_registrations' },
        (payload) => {
          if (payload.new && payload.new.role === 'driver') {
            toast.success(`Driver baru mendaftar: ${payload.new.name}!`, {
              icon: '🛵',
              duration: 8000,
            });
            fetchSupabaseDrivers();
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (bc) bc.close();
      supabase.removeChannel(channel);
    };
  }, []);

  const pendingDrivers = drivers.filter((d) => d.status === 'Pending');
  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm)
  );

  const handleVerify = async (id, accept) => {
    const newStatus = accept ? 'Active' : 'Inactive';
    
    // Update local state
    setDrivers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
    );

    // Update di localStorage
    try {
      const localData = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
      const updated = localData.map((d) => (d.id === id ? { ...d, status: newStatus } : d));
      localStorage.setItem('wira_mitra_registrations', JSON.stringify(updated));
    } catch (e) {
      console.warn('Storage update warn:', e);
    }

    // Update di Supabase jika tersedia
    try {
      await supabase
        .from('mitra_registrations')
        .update({ status: newStatus })
        .eq('id', id);
    } catch (err) {
      console.log('Update local only', err);
    }

    toast.success(accept ? 'Pengemudi berhasil diverifikasi!' : 'Pengemudi ditolak');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Manajemen Pengemudi (Drivers)
        </h1>
        <button
          onClick={fetchSupabaseDrivers}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          title="Segarkan Data"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Bagian Driver Menunggu Verifikasi */}
      {pendingDrivers.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Menunggu Verifikasi ({pendingDrivers.length})
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Ada pengemudi yang baru mendaftar dan membutuhkan persetujuan Anda.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {pendingDrivers.map((driver) => (
              <div
                key={driver.id}
                className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded shadow-sm"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    {driver.name}
                    {driver.isReal && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                        Pendaftar Baru (Live)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {driver.phone} • {driver.vehicle} ({driver.plate})
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(driver.id, true)}
                    className="flex items-center gap-1 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded hover:bg-green-200 transition"
                  >
                    <CheckCircle size={16} /> Verifikasi
                  </button>
                  <button
                    onClick={() => handleVerify(driver.id, false)}
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

      {/* Tabel Keseluruhan Driver */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Cari nama atau nomor HP..."
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
                  Nama / Kontak
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Kendaraan
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Rating
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Total Trip
                </th>
                <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">
                  Status
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredDrivers.map((driver) => (
                <tr
                  key={driver.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                      {driver.name}
                      {driver.isReal && (
                        <span className="w-2 h-2 rounded-full bg-green-500" title="Live Database"></span>
                      )}
                    </div>
                    <div className="text-slate-500">{driver.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="dark:text-white">{driver.vehicle}</div>
                    <div className="text-slate-500 text-xs">{driver.plate}</div>
                  </td>
                  <td className="px-6 py-4 dark:text-white">
                    {driver.rating > 0 ? `⭐ ${driver.rating}` : '-'}
                  </td>
                  <td className="px-6 py-4 dark:text-white">{driver.trips}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={driver.status} />
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

export default DriversPage;
