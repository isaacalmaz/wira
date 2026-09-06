import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Wrench, Ban, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TechniciansPage = () => {
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTechs = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').contains('mitra_access', '["technician"]').order('created_at', { ascending: false });
    if (data) setTechs(data);
    setLoading(false);
  };

  useEffect(() => { fetchTechs(); }, []);

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    await supabase.from('users').update({ status: newStatus }).eq('id', id);
    toast.success(`Status diubah menjadi ${newStatus}`);
    fetchTechs();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="text-primary"/> Manajemen Teknisi</h1>
          <p className="text-sm text-slate-500">Daftar Mitra Jasa Servis</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center">Memuat...</div> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4">Nama Teknisi</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Telepon</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {techs.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{t.name}</td>
                  <td className="px-6 py-4 text-slate-500">{t.email}</td>
                  <td className="px-6 py-4">{t.phone}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => toggleStatus(t.id, t.status || 'Aktif')} className="text-slate-400 hover:text-primary">
                      {t.status === 'Aktif' ? <Ban size={18} /> : <CheckCircle size={18} />}
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
export default TechniciansPage;
