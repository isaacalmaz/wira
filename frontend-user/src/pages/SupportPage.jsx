import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Plus, X, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
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
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg flex items-center gap-1"><AlertCircle size={12}/> {t('support.status_open')}</span>;
      case 'in_progress':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> {t('support.status_in_progress')}</span>;
      case 'resolved':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg flex items-center gap-1"><CheckCircle size={12}/> {t('support.status_resolved')}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-slate-900 pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-4 sticky top-0 z-10 shadow-sm border-b border-slate-100 dark:border-slate-800">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="text-primary" /> {t('support.title')}
        </h1>
        <p className="text-xs text-slate-500 mt-1">{t('support.subtitle')}</p>
      </div>

      <div className="p-4 space-y-4">
        <Button 
          className="w-full font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          onClick={() => setShowModal(true)}
        >
          <Plus size={18} /> {t('support.new_report')}
        </Button>

        {loading ? (
          <div className="text-center py-10 text-slate-500">{t('support.loading')}</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
            <p>{t('support.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('support.history_title')}</h2>
            {tickets.map(ticket => (
              <Card key={ticket.id} className="p-4 space-y-3 shadow-sm border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">{ticket.subject}</h3>
                  {getStatusBadge(ticket.status)}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {ticket.description}
                </p>
                <div className="flex items-center text-[10px] text-slate-400 gap-1 mt-2">
                  <Clock size={10} /> {new Date(ticket.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID')}
                </div>
                
                {ticket.admin_response && (
                  <div className="mt-3 p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10">
                    <p className="text-xs font-semibold text-primary mb-1">{t('support.admin_reply')}</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{ticket.admin_response}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Laporan Baru */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('support.modal_title')}</h3>
              <button 
                onClick={() => setShowModal(false)}
                title={t('common.close')}
                aria-label={t('common.close')}
                className="p-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">{t('support.subject_label')}</label>
                <input 
                  type="text" 
                  placeholder={t('support.subject_placeholder')}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">{t('support.description_label')}</label>
                <textarea 
                  rows="4"
                  placeholder={t('support.description_placeholder')}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-700 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                ></textarea>
              </div>
              <Button type="submit" disabled={submitLoading} className="w-full font-bold shadow-lg shadow-primary/20">
                {submitLoading ? t('common.sending') : t('support.submit')}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
