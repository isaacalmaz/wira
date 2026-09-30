import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Plus, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionHeader, Sheet, Spinner, Textarea } from '../components/ui';
import { useTranslation } from '../i18n';

export default function SupportPage() {
  const { user } = useAuth();
  const { t, lang } = useTranslation();
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
      toast.error(t('support.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error(t('support.incomplete'));
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
      
      toast.success(t('support.success'));
      setShowModal(false);
      setSubject('');
      setDescription('');
      fetchTickets();
    } catch (err) {
      console.error(err);
      toast.error(t('support.failed'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <Badge tone="warning" dot>{t('support.status_open')}</Badge>;
      case 'in_progress':
        return <Badge tone="brand" dot>{t('support.status_in_progress')}</Badge>;
      case 'resolved':
        return <Badge tone="success" dot>{t('support.status_resolved')}</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} className="!mb-0" />

      <Button block leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setShowModal(true)}>
        {t('support.new_report')}
      </Button>

      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-ink-muted">
          <Spinner size={18} className="text-brand-ink" /> {t('support.loading')}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={<MessageSquare size={24} />} title={t('support.empty')} />
      ) : (
        <section>
          <SectionHeader title={t('support.history_title')} />
          <div className="flex flex-col gap-3">
            {tickets.map(ticket => (
              <Card key={ticket.id} className="flex flex-col gap-2.5">
                <div className="flex items-start gap-3">
                  <h3 className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-snug text-ink">{ticket.subject}</h3>
                  {getStatusBadge(ticket.status)}
                </div>
                <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-ink-muted">
                  {ticket.description}
                </p>
                <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted">
                  <Clock size={12} aria-hidden="true" /> {new Date(ticket.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID')}
                </div>

                {ticket.admin_response && (
                  <div className="mt-1 flex flex-col gap-1 rounded-control border border-brand-line bg-brand-soft p-3">
                    <p className="text-[12px] font-semibold text-brand-ink">{t('support.admin_reply')}</p>
                    <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-ink">{ticket.admin_response}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Sheet Laporan Baru */}
      <Sheet
        open={showModal}
        onClose={() => setShowModal(false)}
        title={t('support.modal_title')}
        closeLabel={t('common.close')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="support-ticket-form" isLoading={submitLoading}>
              {submitLoading ? t('common.sending') : t('support.submit')}
            </Button>
          </>
        )}
      >
        <form id="support-ticket-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t('support.subject_label')} htmlFor="support-subject">
            <Input
              id="support-subject"
              type="text"
              placeholder={t('support.subject_placeholder')}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
            />
          </Field>
          <Field label={t('support.description_label')} htmlFor="support-description">
            <Textarea
              id="support-description"
              rows={4}
              placeholder={t('support.description_placeholder')}
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
