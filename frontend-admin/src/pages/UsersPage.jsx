import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Users, Search, Ban, CheckCircle, Car, Package, Store, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MITRA_ROLES = [
  { key: 'driver', label: 'Driver', icon: Car },
  { key: 'courier', label: 'Kurir', icon: Package },
  { key: 'merchant', label: 'Merchant', icon: Store },
  { key: 'technician', label: 'Teknisi', icon: Wrench },
];

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setUsers(data);
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengambil data pengguna');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    try {
      const { error, data } = await supabase.from('users').update({ status: newStatus }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success(`Status diubah menjadi ${newStatus}`);
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status');
    }
  };

  const toggleMitraAccess = async (user, roleKey) => {
    const current = Array.isArray(user.mitra_access) ? user.mitra_access : [];
    const hasRole = current.includes(roleKey);
    const nextAccess = hasRole ? current.filter(r => r !== roleKey) : [...current, roleKey];

    try {
      const { error, data } = await supabase
        .from('users')
        .update({ mitra_access: nextAccess })
        .eq('id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak oleh RLS atau pengguna tidak ditemukan.");
      toast.success(hasRole ? `Akses ${roleKey} dicabut dari ${user.name}` : `Akses ${roleKey} diberikan ke ${user.name}`);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, mitra_access: nextAccess } : u));
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah akses mitra');
    }
  };

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="text-primary"/> Manajemen Pengguna</h1>
          <p className="text-sm text-slate-500">Semua pengguna Wira, termasuk pengelolaan akses mitra (driver/merchant/teknisi)</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama/email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm w-56"
          />
        </div>
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        {loading ? <div className="p-10 text-center">Memuat...</div> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4">Nama</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Telepon</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Akses Mitra</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(u => {
                const access = Array.isArray(u.mitra_access) ? u.mitra_access : [];
                return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{u.name}</td>
                  <td className="px-6 py-4 text-slate-500">{u.email}</td>
                  <td className="px-6 py-4">{u.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1.5">
                      {MITRA_ROLES.map(({ key, label, icon: Icon }) => {
                        const active = access.includes(key);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleMitraAccess(u, key)}
                            title={active ? `Cabut akses ${label}` : `Berikan akses ${label}`}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${
                              active
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            <Icon size={12} /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(u.id, u.status || 'Aktif')} className="text-slate-400 hover:text-primary">
                      {u.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default UsersPage;
