import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Plus, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionHeader, Sheet, Spinner, Textarea } from '../../components/ui';
import { formatDateTime } from '../../utils/datetime';

export default function SupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchTickets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

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
  // Re-fetch when these inputs change; the fetch function is recreated each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error('Judul dan deskripsi harus diisi');
      return;
    }

    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('support_tickets')
        .insert([{
          user_id: user.id,
          subject: subject.trim(),
          description: description.trim()
        }]);

      if (error) throw error;
      
      toast.success('Keluhan berhasil dikirim');
      setShowModal(false);
      setSubject('');
      setDescription('');
      fetchTickets();
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengirim keluhan');
    } finally {
      setSubmitLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <Badge tone="warning"><AlertCircle size={12} aria-hidden="true" /> Menunggu</Badge>;
      case 'in_progress':
        return <Badge tone="brand"><RefreshCw size={12} aria-hidden="true" /> Diproses</Badge>;
      case 'resolved':
        return <Badge tone="success"><CheckCircle size={12} aria-hidden="true" /> Selesai</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Pusat Bantuan"
        subtitle="Ada kendala? Laporkan kepada kami."
        back
        className="mb-0"
      />

      <Button size="lg" block leftIcon={<Plus size={19} />} onClick={() => setShowModal(true)}>
        Buat Laporan Baru
      </Button>

      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-ink-muted">
          <Spinner size={18} className="text-brand-ink" /> Memuat riwayat...
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={<MessageSquare size={24} />} title="Belum ada riwayat laporan" />
      ) : (
        <section className="flex flex-col">
          <SectionHeader title="Riwayat Laporan Saya" />
          <div className="flex flex-col gap-3">
            {tickets.map(ticket => (
              <Card key={ticket.id} className="flex flex-col gap-2.5">
                <div className="flex items-start gap-3">
                  <h3 className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-snug text-ink">{ticket.subject}</h3>
                  <span className="shrink-0">{getStatusBadge(ticket.status)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-muted">
                  {ticket.description}
                </p>
                <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted">
                  <Clock size={12} aria-hidden="true" /> {formatDateTime(ticket.created_at)}
                </div>

                {ticket.admin_response && (
                  <div className="mt-1 flex flex-col gap-1 rounded-control border border-brand-line bg-brand-soft px-3.5 py-3">
                    <p className="text-xs font-semibold text-brand-ink">Balasan Admin Wira:</p>
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{ticket.admin_response}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Modal Laporan Baru */}
      <Sheet
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Laporkan Kendala"
        icon={<MessageSquare size={22} />}
        footer={(
          <Button type="submit" form="support-ticket-form" size="lg" isLoading={submitLoading}>
            {submitLoading ? 'Mengirim...' : 'Kirim Keluhan'}
          </Button>
        )}
      >
        <form id="support-ticket-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Kendala tentang apa?" htmlFor="support-subject">
            <Input
              id="support-subject"
              type="text"
              placeholder="Misal: Driver belum datang, Barang tertinggal"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
            />
          </Field>
          <Field label="Ceritakan detailnya" htmlFor="support-description">
            <Textarea
              id="support-description"
              rows={4}
              placeholder="Tuliskan secara lengkap agar admin bisa cepat membantu..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </Field>
        </form>
      </Sheet>
    </div>
  );
}
