import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, CalendarDays, CheckCircle2, ChevronLeft, Clock, MessageCircle, ShieldCheck, Star, Wallet, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, EmptyState, Field, Money, Notice, Sheet, Spinner, Textarea, cx } from '../../components/ui';
import { avatarSrc } from '../../utils/avatar';
import ProjectChat from './ProjectChat';
import { PROJECT_STATUS_TONE, STAGE_STATUS_TONE, formatDate } from './projectShared';

function TechHeader({ q, t }) {
  const src = avatarSrc(q.avatar_url);
  return (
    <Link to={`/technicians/${q.technician_id}`} className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft text-[15px] font-bold text-brand-ink" aria-hidden="true">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (q.technician_name || '?').charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-bold text-ink">
          {q.technician_name}
          {q.verified && <BadgeCheck size={15} className="text-success" aria-label={t('partners.verified')} />}
        </span>
        <span className="text-[12px] text-ink-muted">
          {q.rating_count >= 3
            ? <><Star size={11} className="mr-0.5 inline fill-pay text-pay" aria-hidden="true" />{t('service.rating_line', { avg: Number(q.rating_avg).toFixed(1), count: q.rating_count })}</>
            : t('service.new_partner')}
          {q.jobs_completed > 0 ? ` · ${t('service.jobs_done', { count: q.jobs_completed })}` : ''}
        </span>
      </span>
    </Link>
  );
}

/**
 * One project for its customer (migrations/0093): compare quotes and pick
 * one (the DP is paid then), then pay, approve or object to each stage.
 */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { balance, refreshWallet } = useWallet();
  const { t } = useTranslation();
  const [project, setProject] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatWith, setChatWith] = useState(null); // quote
  const [accepting, setAccepting] = useState(null); // quote
  const [confirmStage, setConfirmStage] = useState(null); // { stage, action: 'fund' | 'approve' }
  const [disputeStage, setDisputeStage] = useState(null);
  const [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: q }, { data: m }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('get_project_quotes', { p_project_id: id }),
      supabase.from('project_milestones').select('*').eq('project_id', id).order('seq'),
    ]);
    setProject(p || null);
    setQuotes(q || []);
    setStages(m || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast.success(okMsg);
      refreshWallet?.();
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || t('projects.action_failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-brand-ink"><Spinner size={28} /></div>;
  if (!project) return <EmptyState title={t('projects.not_found')} />;

  const live = quotes.filter((q) => q.status === 'submitted' && new Date(q.valid_until) > new Date());
  const accepted = quotes.find((q) => q.status === 'accepted');
  const firstPercent = (q) => q.milestones?.[0]?.percent || 100;
  const dpOf = (q) => Math.round(Number(q.total) * firstPercent(q) / 100);
  const nextToPay = stages.find((s) => s.status === 'pending' && stages.filter((x) => x.seq < s.seq).every((x) => ['released', 'refunded'].includes(x.status)));
  const canCancel = ['open', 'awarded'].includes(project.status) && !stages.some((s) => ['submitted', 'disputed'].includes(s.status));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-16">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => navigate('/projects')} aria-label={t('common.back')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunken">
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <Badge tone={PROJECT_STATUS_TONE[project.status]} dot>{t(`projects.status.${project.status}`)}</Badge>
          <h1 className="text-balance text-[22px] font-extrabold leading-tight tracking-tight text-ink">{project.title}</h1>
          <p className="text-[12.5px] text-ink-muted">
            {project.area} · {t('projects.posted', { date: formatDate(project.created_at) })}
            {project.status === 'open' ? ` · ${t('projects.closes', { date: formatDate(project.expires_at) })}` : ''}
          </p>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{project.description}</p>
        {project.photos?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {project.photos.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="h-20 w-20 shrink-0 overflow-hidden rounded-control border border-line">
                <img src={src} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-[12.5px]">
          <div><dt className="text-ink-muted">{t('projects.field_start')}</dt><dd className="font-medium text-ink">{formatDate(project.preferred_start)}</dd></div>
          <div>
            <dt className="text-ink-muted">{t('projects.budget')}</dt>
            <dd className="font-medium text-ink">
              {project.budget_min || project.budget_max
                ? <><Money value={Number(project.budget_min || 0)} /> – <Money value={Number(project.budget_max || project.budget_min)} /></>
                : '–'}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Quotes while open */}
      {project.status === 'open' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">{t('projects.quotes_title', { count: live.length })}</h2>
          {live.length === 0 ? (
            <Notice tone="info">{t('projects.waiting_quotes')}</Notice>
          ) : live.map((q) => (
            <Card key={q.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <TechHeader q={q} t={t} />
                <Money value={Number(q.total)} className="shrink-0 text-[18px] font-medium text-ink" />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center text-[12px]">
                <div className="rounded-control bg-sunken px-2 py-2"><dt className="text-ink-muted">{t('projects.duration')}</dt><dd className="font-semibold text-ink">{t('projects.days', { count: q.timeline_days })}</dd></div>
                <div className="rounded-control bg-sunken px-2 py-2"><dt className="text-ink-muted">{t('projects.warranty')}</dt><dd className="font-semibold text-ink">{q.warranty_days ? t('projects.days', { count: q.warranty_days }) : '–'}</dd></div>
                <div className="rounded-control bg-sunken px-2 py-2"><dt className="text-ink-muted">{t('projects.materials')}</dt><dd className="font-semibold text-ink">{q.materials_included ? t('projects.included') : t('projects.excluded')}</dd></div>
              </dl>
              {q.start_date && <p className="flex items-center gap-1.5 text-[12.5px] text-ink"><CalendarDays size={14} className="text-ink-muted" aria-hidden="true" /> {t('projects.can_start', { date: formatDate(q.start_date) })}</p>}
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-ink-muted">{t('projects.stages')}</span>
                <ul className="flex flex-col gap-1 text-[13px]">
                  {q.milestones.map((m, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-ink">{m.label} <span className="text-ink-muted">({m.percent}%)</span></span>
                      <Money value={i === q.milestones.length - 1
                        ? Number(q.total) - q.milestones.slice(0, -1).reduce((s, x) => s + Math.round(Number(q.total) * x.percent / 100), 0)
                        : Math.round(Number(q.total) * m.percent / 100)} className="text-ink" />
                    </li>
                  ))}
                </ul>
              </div>
              {q.line_items?.length > 0 && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer font-semibold text-brand-ink">{t('projects.breakdown')}</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {q.line_items.map((li, i) => (
                      <li key={i} className="flex justify-between gap-3"><span className="text-ink">{li.label}</span><Money value={Number(li.amount)} className="text-ink" /></li>
                    ))}
                  </ul>
                </details>
              )}
              {q.message && <p className="whitespace-pre-line rounded-control border border-line bg-ground px-3 py-2 text-[13px] leading-relaxed text-ink">{q.message}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="secondary" leftIcon={<MessageCircle size={16} />} onClick={() => setChatWith(q)}>{t('projects.chat')}</Button>
                <Button onClick={() => setAccepting(q)}>{t('projects.choose')}</Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {/* After a quote was chosen */}
      {accepted && project.status !== 'open' && (
        <section className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <TechHeader q={accepted} t={t} />
              <Money value={Number(accepted.total)} className="shrink-0 text-[17px] font-medium text-ink" />
            </div>
            {['awarded'].includes(project.status) && (
              <Button variant="secondary" leftIcon={<MessageCircle size={16} />} onClick={() => setChatWith(accepted)}>{t('projects.chat_with', { name: accepted.technician_name.split(' ')[0] })}</Button>
            )}
          </Card>

          <h2 className="text-[15px] font-bold text-ink">{t('projects.stages')}</h2>
          <Card padding="none">
            <ul className="divide-y divide-line">
              {stages.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="text-[14px] font-semibold text-ink">{s.seq}. {s.label}</span>
                      <Badge tone={STAGE_STATUS_TONE[s.status]} dot>{t(`projects.stage.${s.status}`)}</Badge>
                    </span>
                    <Money value={Number(s.amount)} className="shrink-0 text-[15px] font-medium text-ink" />
                  </div>
                  {s.status === 'submitted' && (
                    <>
                      {s.note && <p className="text-[13px] leading-relaxed text-ink">{s.note}</p>}
                      {s.proof_photos?.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                          {s.proof_photos.map((src) => (
                            <a key={src} href={src} target="_blank" rel="noreferrer" className="h-16 w-16 shrink-0 overflow-hidden rounded-control border border-line">
                              <img src={src} alt="" className="h-full w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="flex items-center gap-1.5 text-[12px] text-ink-muted"><Clock size={13} aria-hidden="true" /> {t('projects.auto_release')}</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Button variant="secondary" leftIcon={<XCircle size={16} />} onClick={() => { setDisputeStage(s); setReason(''); }}>{t('projects.object')}</Button>
                        <Button leftIcon={<CheckCircle2 size={16} />} onClick={() => setConfirmStage({ stage: s, action: 'approve' })}>{t('projects.approve')}</Button>
                      </div>
                    </>
                  )}
                  {s.status === 'disputed' && <Notice tone="warning">{t('projects.disputed_note')}</Notice>}
                  {nextToPay?.id === s.id && project.status === 'awarded' && (
                    <Button leftIcon={<Wallet size={16} />} onClick={() => setConfirmStage({ stage: s, action: 'fund' })}>{t('projects.pay_stage')}</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {t('projects.escrow_note')}
          </p>
        </section>
      )}

      {canCancel && (
        <Button variant="danger-soft" onClick={() => { setCancelOpen(true); setReason(''); }}>{t('projects.cancel')}</Button>
      )}

      {/* Sheets */}
      <Sheet open={!!chatWith} onClose={() => setChatWith(null)} title={chatWith ? t('projects.chat_with', { name: chatWith.technician_name.split(' ')[0] }) : ''} closeLabel={t('common.close')}>
        {chatWith && user && <ProjectChat projectId={project.id} technicianId={chatWith.technician_id} userId={user.id} />}
      </Sheet>

      <Sheet
        open={!!accepting}
        onClose={() => { if (!busy) setAccepting(null); }}
        dismissible={!busy}
        title={t('projects.accept_title')}
        description={accepting ? t('projects.accept_desc', { name: accepting.technician_name }) : ''}
        footer={accepting && (
          <>
            <Button variant="secondary" onClick={() => setAccepting(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              isLoading={busy}
              disabled={balance < dpOf(accepting)}
              onClick={async () => { if (await run(() => supabase.rpc('accept_project_quote', { p_quote_id: accepting.id }), t('projects.accepted'))) setAccepting(null); }}
            >
              {t('projects.pay_dp')}
            </Button>
          </>
        )}
      >
        {accepting && (
          <div className="flex flex-col gap-3 text-[13.5px]">
            <div className="flex justify-between"><span className="text-ink-muted">{t('projects.total')}</span><Money value={Number(accepting.total)} className="text-ink" /></div>
            <div className="flex justify-between font-semibold"><span className="text-ink">{t('projects.dp_now', { label: accepting.milestones[0].label })}</span><Money value={dpOf(accepting)} className="text-ink" /></div>
            <div className="flex justify-between"><span className="text-ink-muted">{t('projects.balance')}</span><Money value={balance} className={cx(balance < dpOf(accepting) ? 'text-danger-ink' : 'text-ink')} /></div>
            {balance < dpOf(accepting) && <Notice tone="danger">{t('projects.topup_first')}</Notice>}
            <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('projects.escrow_note')}</p>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!confirmStage}
        onClose={() => { if (!busy) setConfirmStage(null); }}
        dismissible={!busy}
        title={confirmStage?.action === 'fund' ? t('projects.pay_stage') : t('projects.approve')}
        description={confirmStage ? (confirmStage.action === 'fund' ? t('projects.fund_desc', { label: confirmStage.stage.label }) : t('projects.approve_desc', { label: confirmStage.stage.label })) : ''}
        footer={confirmStage && (
          <>
            <Button variant="secondary" onClick={() => setConfirmStage(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              isLoading={busy}
              disabled={confirmStage.action === 'fund' && balance < Number(confirmStage.stage.amount)}
              onClick={async () => {
                const fn = confirmStage.action === 'fund'
                  ? () => supabase.rpc('fund_project_milestone', { p_milestone_id: confirmStage.stage.id })
                  : () => supabase.rpc('approve_project_milestone', { p_milestone_id: confirmStage.stage.id });
                if (await run(fn, confirmStage.action === 'fund' ? t('projects.funded') : t('projects.released'))) setConfirmStage(null);
              }}
            >
              {confirmStage.action === 'fund' ? t('projects.pay_now') : t('projects.approve')}
            </Button>
          </>
        )}
      >
        {confirmStage && (
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="flex justify-between font-semibold"><span className="text-ink">{confirmStage.stage.label}</span><Money value={Number(confirmStage.stage.amount)} className="text-ink" /></div>
            {confirmStage.action === 'fund' && (
              <div className="flex justify-between"><span className="text-ink-muted">{t('projects.balance')}</span><Money value={balance} className="text-ink" /></div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!disputeStage}
        onClose={() => { if (!busy) setDisputeStage(null); }}
        dismissible={!busy}
        tone="danger"
        title={t('projects.object_title')}
        description={t('projects.object_desc')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDisputeStage(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              isLoading={busy}
              disabled={reason.trim().length < 10}
              onClick={async () => { if (await run(() => supabase.rpc('dispute_project_milestone', { p_milestone_id: disputeStage.id, p_reason: reason }), t('projects.objected'))) setDisputeStage(null); }}
            >
              {t('projects.object')}
            </Button>
          </>
        )}
      >
        <Field label={t('projects.object_reason')} htmlFor="dispute-reason">
          <Textarea id="dispute-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Sheet>

      <Sheet
        open={cancelOpen}
        onClose={() => { if (!busy) setCancelOpen(false); }}
        dismissible={!busy}
        tone="danger"
        title={t('projects.cancel_title')}
        description={t('projects.cancel_desc')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busy}>{t('common.back')}</Button>
            <Button variant="danger" isLoading={busy} onClick={async () => { if (await run(() => supabase.rpc('cancel_project', { p_project_id: project.id, p_reason: reason }), t('projects.cancelled'))) setCancelOpen(false); }}>
              {t('projects.cancel')}
            </Button>
          </>
        )}
      >
        <Field label={t('projects.cancel_reason')} htmlFor="cancel-reason">
          <Textarea id="cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}
