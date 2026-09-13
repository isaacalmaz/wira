const fs = require('fs');
const file = 'frontend-admin/src/pages/FinancePage.jsx';

const newContent = `import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { DollarSign, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const FinancePage = () => {
  const [revenue, setRevenue] = useState(0);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    // Fetch Revenue
    const { data: ordersData } = await supabase.from('orders').select('total_price').eq('status', 'completed');
    if (ordersData) {
      setRevenue(ordersData.reduce((sum, o) => sum + (o.total_price || 0), 0));
    }

    // Fetch Topup Requests
    const { data: topupData } = await supabase
      .from('topup_requests')
      .select('*, users(name, phone)')
      .order('created_at', { ascending: false });
    
    if (topupData) {
      setTopups(topupData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Yakin ingin menyetujui top-up ini?')) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('approve_topup_request', { request_id: id });
      if (error) throw error;
      if (data) {
        toast.success('Top-up berhasil disetujui');
        fetchData();
      } else {
        toast.error('Gagal menyetujui, mungkin status sudah berubah');
      }
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('Yakin ingin menolak top-up ini?')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('topup_requests')
        .update({ status: 'rejected' })
        .eq('id', id);
      if (error) throw error;
      toast.success('Top-up berhasil ditolak');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="text-primary"/> Keuangan & Top-Up</h1>
        <p className="text-sm text-slate-500">Laporan pendapatan asli dan permintaan saldo pengguna</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-gradient-to-br from-green-500 to-emerald-700 text-white border-none shadow-lg">
          <p className="text-green-100 font-semibold mb-2">Total Nilai Transaksi (GMV)</p>
          <h2 className="text-4xl font-black mb-4">Rp {revenue.toLocaleString('id-ID')}</h2>
          <p className="text-sm opacity-80 flex items-center gap-2"><TrendingUp size={16}/> Seluruh pesanan selesai</p>
        </div>
        <div className="card shadow-md">
          <p className="text-slate-500 font-semibold mb-2">Estimasi Komisi Aplikasi (10%)</p>
          <h2 className="text-4xl font-black text-slate-800 mb-4">Rp {(revenue * 0.1).toLocaleString('id-ID')}</h2>
        </div>
      </div>

      <div className="card shadow-md">
        <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2">
          <Clock size={20} className="text-slate-500"/> Permintaan Top-Up WiraPay
        </h3>
        
        {loading ? (
          <div className="text-center py-8 text-slate-500">Memuat data...</div>
        ) : topups.length === 0 ? (
          <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl">Belum ada permintaan top-up.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Nominal</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topups.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{t.users?.name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{t.users?.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      Rp {t.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={\`px-2 py-1 rounded-full text-xs font-semibold \${
                        t.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        t.status === 'approved' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }\`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'pending' && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleApprove(t.id)}
                            disabled={actionLoading}
                            className="p-1.5 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition"
                            title="Setujui"
                          >
                            <CheckCircle size={18}/>
                          </button>
                          <button 
                            onClick={() => handleReject(t.id)}
                            disabled={actionLoading}
                            className="p-1.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition"
                            title="Tolak"
                          >
                            <XCircle size={18}/>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancePage;
`;

fs.writeFileSync(file, newContent);
console.log("Patched FinancePage.jsx");
