import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { PROJECT_STATUS_TONE, formatDate } from './projectShared';

/** The customer's projects (migrations/0093), newest first. */
export default function MyProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('projects')
      .select('id, title, area, status, created_at, expires_at, project_quotes(id, status)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [user]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-16">
      <PageHeader back="/service" backLabel={t('common.back')} title={t('projects.my_title')} subtitle={t('projects.my_subtitle')} className="mb-0" />
      <Button leftIcon={<Plus size={18} />} onClick={() => navigate('/projects/new')}>{t('projects.new_cta')}</Button>
      {loading ? (
        <div className="flex justify-center py-12 text-brand-ink"><Spinner size={24} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title={t('projects.empty_title')} description={t('projects.empty_desc')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((p) => {
            const quotes = (p.project_quotes || []).filter((q) => ['submitted', 'accepted'].includes(q.status)).length;
            return (
              <li key={p.id}>
                <Card as="button" type="button" onClick={() => navigate(`/projects/${p.id}`)} className="flex w-full items-center gap-3 text-left transition-colors hover:bg-sunken/40">
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <Badge tone={PROJECT_STATUS_TONE[p.status]} dot>{t(`projects.status.${p.status}`)}</Badge>
                    <span className="text-[15px] font-bold text-ink">{p.title}</span>
                    <span className="text-[12.5px] text-ink-muted">
                      {p.area} · {formatDate(p.created_at)}
                      {p.status === 'open' ? ` · ${t('projects.quote_count', { count: quotes })}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
