import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { MessageSquare, Search, Filter, MessageCircle, CheckCircle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [responseMsg, setResponseMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      let query = supabase.from('support_tickets').select('*, users(name, phone)').order('created_at', { ascending: false });
      if (filter !== 'all') {
        query = query.eq('status', filter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat tiket bantuan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const handleUpdateStatus = async (id, newStatus, response = null) => {
    setActionLoading(true);
    try {
      const updates = { status: newStatus, updated_at: new Date().toISOString() };
      if (response !== null) {
        updates.admin_response = response;
      }
      
      const { error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Status tiket berhasil diperbarui');
      
      if (selectedTicket && selectedTicket.id === id) {
        setSelectedTicket(null);
        setResponseMsg('');
      }
      
      fetchTickets();
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui status');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open': return <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-semibold">Menunggu</span>;
      case 'in_progress': return <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full text-xs font-semibold">Diproses</span>;
      case 'resolved': return <span className="bg-green-100 text-green-800 px-2.5 py-1 rounded-full text-xs font-semibold">Selesai</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pusat Bantuan</h1>
          <p className="text-slate-500">Kelola keluhan dan masalah pelanggan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex gap-2 overflow-x-auto">
        {['all', 'open', 'in_progress', 'resolved'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              filter === f 
                ? 'bg-primary text-white shadow-md shadow-primary/20' 
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {f === 'all' ? 'Semua Tiket' : 
             f === 'open' ? 'Menunggu (Baru)' : 
             f === 'in_progress' ? 'Sedang Diproses' : 'Selesai'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-slate-500">Memuat data tiket...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-10 text-slate-500 bg-slate-50">Tidak ada tiket ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Pelapor</th>
                  <th className="px-4 py-3 font-semibold">Kendala</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {new Date(t.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{t.users?.name || 'User'}</div>
                      <div className="text-xs text-slate-500">{t.users?.phone || '-'}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={t.description}>
                      <div className="font-medium text-slate-800">{t.subject}</div>
                      <div className="text-xs text-slate-500 truncate">{t.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => {
                          setSelectedTicket(t);
                          setResponseMsg(t.admin_response || '');
                        }}
                        className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                        title="Lihat Detail & Balas"
                      >
                        <MessageCircle size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Detail Tiket Bantuan</h3>
              <button 
                onClick={() => setSelectedTicket(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Status Tiket</label>
                {getStatusBadge(selectedTicket.status)}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Pelapor</label>
                  <p className="text-sm font-medium">{selectedTicket.users?.name}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">No HP</label>
                  <p className="text-sm font-medium">{selectedTicket.users?.phone}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Kendala</label>
                <p className="text-sm font-bold text-slate-800">{selectedTicket.subject}</p>
                <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-700 whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Balasan Admin Wira</label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition"
                  rows="3"
                  placeholder="Ketik balasan atau solusi di sini..."
                  value={responseMsg}
                  onChange={e => setResponseMsg(e.target.value)}
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleUpdateStatus(selectedTicket.id, 'in_progress', responseMsg)}
                  disabled={actionLoading || selectedTicket.status === 'in_progress'}
                  className="flex-1 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  Tandai Diproses
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedTicket.id, 'resolved', responseMsg)}
                  disabled={actionLoading || selectedTicket.status === 'resolved'}
                  className="flex-1 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  Selesaikan Kasus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
