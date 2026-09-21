import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Users, Search, Ban, CheckCircle, Car, Store, Wrench, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';

// 'courier' is no longer a separate mitra_access role - Driver now covers
// Ride/Kurir/Makanan together via self-service preferences (migrations/0033).
const MITRA_ROLES = [
  { key: 'driver', label: 'Driver', icon: Car },
  { key: 'merchant', label: 'Merchant', icon: Store },
  { key: 'technician', label: 'Teknisi', icon: Wrench },
];

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionDesc, setCorrectionDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleBalanceCorrection = async (e) => {
    e.preventDefault();
    if (!correctionModal) return;
    const amt = Number(correctionAmount);
    if (!amt || isNaN(amt)) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (!correctionDesc.trim()) {
      toast.error('Catatan wajib diisi');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Update wallet balance using atomic RPC
      const { error: creditErr } = await supabase.rpc('credit_wallet_balance_atomic', {
        p_user_id: correctionModal.id,
        p_amount: amt
      });
      if (creditErr) throw creditErr;

      // 2. Insert transaction log
      const { error: txErr } = await supabase.from('transactions').insert({
        user_id: correctionModal.id,
        type: amt > 0 ? 'topup' : 'payment', // using standard types so UI handles it gracefully
        amount: Math.abs(amt),
        description: 'KOREKSI ADMIN: ' + correctionDesc,
        reference_id: 'admin_correction_' + Date.now()
      });
      if (txErr) throw txErr;

      toast.success('Koreksi saldo berhasil diterapkan');
      setCorrectionModal(null);
      setCorrectionAmount('');
      setCorrectionDesc('');
      fetchUsers(); // refresh data to show new balance (if we displayed it)
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal melakukan koreksi saldo');
    } finally {
      setIsSubmitting(false);
    }
  };


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
                <th className="px-6 py-4">Saldo</th>
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
                  <td className="px-6 py-4 font-bold text-slate-700">Rp {(u.wallet_balance || 0).toLocaleString('id-ID')}</td>
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
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                    <button 
                      onClick={() => setCorrectionModal(u)}
                      className="text-slate-400 hover:text-green-600 transition"
                      title="Koreksi Saldo"
                    >
                      <Wallet size={18} />
                    </button>
                    <button onClick={() => toggleStatus(u.id, u.status || 'Aktif')} className="text-slate-400 hover:text-red-500 transition">
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

      {/* Modal Koreksi Saldo */}
      {correctionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-bold text-slate-800">Koreksi Saldo Manual</h3>
              <p className="text-xs text-slate-500 mt-1">
                Atas nama: <span className="font-bold text-slate-700">{correctionModal.name}</span>
              </p>
            </div>
            
            <form onSubmit={handleBalanceCorrection} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nominal Koreksi (Rp)</label>
                <input 
                  type="number"
                  placeholder="Misal: 10584 (tambah) atau -10584 (kurangi)"
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                  value={correctionAmount}
                  onChange={e => setCorrectionAmount(e.target.value)}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Gunakan tanda minus (-) untuk menarik saldo.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan / Alasan</label>
                <input 
                  type="text"
                  placeholder="Misal: Salah transfer QRIS, Refund manual"
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                  value={correctionDesc}
                  onChange={e => setCorrectionDesc(e.target.value)}
                  required
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectionModal(null)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses...' : 'Terapkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default UsersPage;
