import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Car, Ban, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const DriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDrivers = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').eq('role', 'driver').order('created_at', { ascending: false });
    if (data) setDrivers(data);
    setLoading(false);
  };

  useEffect(() => { fetchDrivers(); }, []);

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    await supabase.from('users').update({ status: newStatus }).eq('id', id);
    toast.success(`Status diubah menjadi ${newStatus}`);
    fetchDrivers();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="text-primary"/> Manajemen Driver</h1>
          <p className="text-sm text-slate-500">Daftar Mitra Pengemudi</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center">Memuat...</div> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4">Nama Driver</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Telepon</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{d.name}</td>
                  <td className="px-6 py-4 text-slate-500">{d.email}</td>
                  <td className="px-6 py-4">{d.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${d.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {d.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(d.id, d.status || 'Aktif')} className="text-slate-400 hover:text-primary">
                      {d.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default DriversPage;
