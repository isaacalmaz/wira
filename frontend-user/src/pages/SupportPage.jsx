import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Plus, Clock, Mail, Phone, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Button, Card, EmptyState, Field, IconTile, Input, ListRow, PageHeader, SectionHeader, Sheet, Spinner, Textarea } from '../components/ui';
import { useTranslation } from '../i18n';
import { formatDateTime } from '../utils/formatDate';

export default function SupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const handleOpenReportModal = () => {
    if (!user) {
      toast.error(t('common.login_required'));
      navigate('/login');
      return;
    }
    setShowModal(true);
  };

  const fetchTickets = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
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
  }, [user, t]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

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

  const rowCls = 'min-h-16 px-4 py-3.5';

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader
        title={t('support.title')}
        subtitle={t('support.subtitle')}
        back
        backLabel={t('common.back')}
        className="!mb-0"
      />

      {/* Saluran Kontak Resmi */}
      <section className="flex flex-col gap-2.5">
        <SectionHeader title={t('contact.title')} className="!mb-0" />
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          <ListRow
            as="a"
            href="mailto:halo@wira.one"
            className={rowCls}
            leading={<IconTile tone="brand"><Mail size={19} aria-hidden="true" /></IconTile>}
            title={t('contact.email_label')}
            subtitle={<span className="font-medium text-brand-ink">halo@wira.one</span>}
            chevron
          />
          <ListRow
            as="a"
            href="tel:085975079134"
            className={rowCls}
            leading={<IconTile tone="brand"><Phone size={19} aria-hidden="true" /></IconTile>}
            title={t('contact.phone_label')}
            subtitle={<span className="font-mono font-medium text-brand-ink">0859 7507 9134</span>}
            chevron
          />
          <ListRow
            className={rowCls}
            leading={<IconTile tone="neutral"><MapPin size={19} aria-hidden="true" /></IconTile>}
            title={t('contact.office_label')}
            subtitle={t('contact.office_value')}
          />
        </Card>
      </section>

      {/* Tiket Bantuan & Komplain */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionHeader title={t('support.history_title')} className="!mb-0" />
          <Button
            size="sm"
            leftIcon={<Plus size={16} aria-hidden="true" />}
            onClick={handleOpenReportModal}
          >
            {t('support.new_report')}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-ink-muted">
            <Spinner size={18} className="text-brand-ink" /> {t('support.loading')}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title={t('support.empty')}
            action={(
              <Button size="sm" leftIcon={<Plus size={16} />} onClick={handleOpenReportModal}>
                {t('support.new_report')}
              </Button>
            )}
          />
        ) : (
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
                  <Clock size={12} aria-hidden="true" /> {formatDateTime(ticket.created_at, lang === 'en' ? 'en-GB' : 'id-ID')}
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
        )}
      </section>

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
