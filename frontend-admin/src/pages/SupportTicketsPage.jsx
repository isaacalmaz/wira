import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { MessageCircle, CheckCircle2, LifeBuoy } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, Sheet, Spinner, Table, Textarea } from '../components/ui';
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
      
      // Chain .select() and check the returned row count — under RLS, an
      // update blocked by policy returns { error: null, data: [] } (0 rows
      // affected), which looks identical to success unless checked. See
      // migrations/0040_support_tickets_admin_update_rls.sql.
      const { data, error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Akses ditolak atau tiket tidak ditemukan (0 baris diperbarui).');
      }
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
      case 'open': return <Badge tone="warning" dot>Menunggu</Badge>;
      case 'in_progress': return <Badge tone="brand" dot>Diproses</Badge>;
      case 'resolved': return <Badge tone="success" dot>Selesai</Badge>;
      default: return null;
    }
  };

  const FILTER_OPTIONS = ['all', 'open', 'in_progress', 'resolved'].map(f => ({
    value: f,
    label: f === 'all' ? 'Semua Tiket' :
      f === 'open' ? 'Menunggu (Baru)' :
      f === 'in_progress' ? 'Sedang Diproses' : 'Selesai',
  }));

  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pusat Bantuan"
        subtitle="Kelola keluhan dan masalah pelanggan"
        className="!mb-0"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
          size="sm"
          ariaLabel="Filter status tiket"
          className="max-w-full overflow-x-auto no-scrollbar"
        />
        {!loading && (
          <p className="text-[13px] text-ink-muted sm:ml-auto">
            <span className="font-mono font-medium text-ink">{tickets.length.toLocaleString('id-ID')}</span> tiket
          </p>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <Card className="flex items-center justify-center gap-3 py-16 text-[13.5px] text-ink-muted">
          <Spinner size={18} className="text-brand" /> Memuat data tiket...
        </Card>
      ) : tickets.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={22} />} title="Tidak ada tiket ditemukan." />
      ) : (
        <Table titleCol={2}>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Pelapor</th>
              <th>Kendala</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id}>
                <td className="whitespace-nowrap font-mono text-[12px] text-ink-muted">
                  {new Date(t.created_at).toLocaleString('id-ID')}
                </td>
                <td className="whitespace-nowrap">
                  <div className="font-semibold text-ink">{t.users?.name || 'User'}</div>
                  <div className="font-mono text-xs text-ink-muted">{t.users?.phone || '-'}</div>
                </td>
                <td className="max-w-[320px]" title={t.description}>
                  <div className="truncate font-semibold text-ink">{t.subject}</div>
                  <div className="truncate text-xs text-ink-muted">{t.description}</div>
                </td>
                <td>
                  {getStatusBadge(t.status)}
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedTicket(t);
                      setResponseMsg(t.admin_response || '');
                    }}
                    title="Lihat Detail & Balas"
                    leftIcon={<MessageCircle size={15} />}
                    className="whitespace-nowrap"
                  >
                    Balas
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* Detail Modal */}
      <Sheet
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title="Detail Tiket Bantuan"
        size="lg"
        footer={selectedTicket ? (
          <>
            <Button
              variant="secondary"
              onClick={() => handleUpdateStatus(selectedTicket.id, 'in_progress', responseMsg)}
              disabled={actionLoading || selectedTicket.status === 'in_progress'}
            >
              Tandai Diproses
            </Button>
            <Button
              onClick={() => handleUpdateStatus(selectedTicket.id, 'resolved', responseMsg)}
              disabled={actionLoading || selectedTicket.status === 'resolved'}
              leftIcon={<CheckCircle2 size={17} />}
            >
              Selesaikan Kasus
            </Button>
          </>
        ) : null}
      >
        {selectedTicket && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 rounded-card border border-line bg-card p-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className={eyebrow}>Status Tiket</span>
                <div>{getStatusBadge(selectedTicket.status)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>Pelapor</span>
                <p className="text-sm font-semibold text-ink">{selectedTicket.users?.name}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>No HP</span>
                <p className="font-mono text-sm text-ink">{selectedTicket.users?.phone}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={eyebrow}>Kendala</span>
              <p className="text-[15px] font-bold text-ink">{selectedTicket.subject}</p>
              <div className="whitespace-pre-wrap rounded-control border border-line bg-sunken/60 p-3.5 text-sm leading-relaxed text-ink">
                {selectedTicket.description}
              </div>
            </div>

            <Field label="Balasan Admin Wira" htmlFor="ticket-response">
              <Textarea
                id="ticket-response"
                rows={4}
                placeholder="Ketik balasan atau solusi di sini..."
                value={responseMsg}
                onChange={e => setResponseMsg(e.target.value)}
                className="!text-sm"
              />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
