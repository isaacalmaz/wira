import { useState, useEffect } from 'react';
import { Search, RefreshCw, ShieldCheck, UserCheck, UserX, Phone, Mail } from 'lucide-react';
import { supabase } from '../config/supabase';
import { Pagination } from '../components/common/UIComponents';
import toast from 'react-hot-toast';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setUsers(
          data.map((u) => ({
            id: u.id,
            name: u.name || 'Pengguna Wira',
            phone: u.phone || '-',
            email: u.email || '-',
            role: u.role || 'user',
            balance: 0,
            status: 'Aktif',
            created_at: u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : 'Baru saja',
          }))
        );
      } else {
        // Cek juga calon mitra yang terdaftar sebagai akun pengguna
        const { data: flagData } = await supabase
          .from('feature_flags')
          .select('features')
          .eq('region', 'mitra_registrations')
          .maybeSingle();

        if (flagData && Array.isArray(flagData.features) && flagData.features.length > 0) {
          setUsers(
            flagData.features.map((m) => ({
              id: m.id,
              name: m.name,
              phone: m.phone || '-',
              email: m.email || '-',
              role: m.role || 'mitra',
              balance: 0,
              status: m.status === 'Active' ? 'Aktif' : 'Menunggu',
              created_at: m.created_at ? new Date(m.created_at).toLocaleDateString('id-ID') : 'Hari ini',
            }))
          );
        } else {
          setUsers([]);
        }
      }
    } catch (err) {
      console.warn('Error fetching users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleUserStatus = (userId) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const newStatus = u.status === 'Aktif' ? 'Diblokir' : 'Aktif';
          toast.success(`Status pengguna diubah menjadi ${newStatus}`);
          return { ...u, status: newStatus };
        }
        return u;
      })
    );
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone.includes(searchTerm) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Pengguna</h1>
          <p className="text-sm text-slate-500">
            Daftar akun pengguna riil yang terdaftar di super-app Wira
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm w-fit font-medium transition"
          title="Segarkan Data Pengguna"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          <span>Muat Ulang</span>
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Cari nama, email, atau no HP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2 w-full text-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Data Pengguna Riil
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Ketika pengguna mendaftar di aplikasi Wira User atau Mitra, profil mereka akan langsung terhubung ke database dan tampil di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Nama / Kontak</th>
                  <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Peran</th>
                  <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Bergabung</th>
                  <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Status</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">{user.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{user.phone} {user.email !== '-' && `| ${user.email}`}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-medium">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">{user.created_at}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.status === 'Aktif' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => toggleUserStatus(user.id)}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        {user.status === 'Aktif' ? 'Blokir' : 'Aktifkan'}
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
    </div>
  );
};

export default UsersPage;
