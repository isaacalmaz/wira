import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Wrench, History, ClipboardList } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Badge, Card, EmptyState, Money, Notice, PageHeader, Segmented, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  ACTIVE_VISIT_STATUSES, fetchMyJobs, fetchOpenJobs, subscribeToVisitChanges, takeJob, visitInfo, takePackage, groupOpenJobs,
} from '../../services/technicianService';
import VisitJobCard from '../../components/shared/VisitJobCard';
import useSkills, { orderSkill } from '../../hooks/useSkills';
import { friendlyError } from '../../utils/friendlyError';

const byVisitTime = (a, b) => (visitInfo(a).when?.getTime() ?? Infinity) - (visitInfo(b).when?.getTime() ?? Infinity);
const normalizeDispatchMode = (val) => (typeof val === 'string' ? val.replace(/^"|"$/g, '') : (val || 'admin_only'));

/**
 * Pekerjaan: open visits the technician can take (skill match and the
 * customer's chosen technician first are decided by the database,
 * migrations/0089), their active visits, and their history.
 */
const TechOrdersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { nameOf } = useSkills();
  const [tab, setTab] = useState('open');
  const [openJobs, setOpenJobs] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [takingId, setTakingId] = useState(null);
  const [projects, setProjects] = useState([]); // migrations/0093
  const [dispatchMode, setDispatchMode] = useState('admin_only');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [open, mine, proj, modeRow] = await Promise.all([
        fetchOpenJobs(supabase),
        fetchMyJobs(supabase, user.id),
        supabase.rpc('get_technician_projects'),
        supabase.from('app_settings').select('value').eq('key', 'service_dispatch_mode').maybeSingle(),
      ]);
      const currentMode = normalizeDispatchMode(modeRow?.data?.value);
      setDispatchMode(currentMode);
      // Jika mode admin_only, servis ditugaskan eksklusif oleh admin Wira
      // (hanya muncul di tab Pekerjaan Saya setelah ditugaskan).
      const filteredOpen = currentMode === 'hybrid'
        ? open
        : open.filter((job) => job.service_type !== 'service');
      setOpenJobs(filteredOpen);
      setMyJobs(mine);
      setProjects(proj.data || []);
    } catch (err) {
      console.error('Technician jobs load failed:', err);
      toast.error('Daftar pekerjaan belum bisa dimuat. Periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    load();
    const unsub = subscribeToVisitChanges(supabase, user.id, load);
    const channel = supabase
      .channel('tech-orders-dispatch-mode')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.service_dispatch_mode' },
        (payload) => {
          if (payload.new && payload.new.value) {
            setDispatchMode(normalizeDispatchMode(payload.new.value));
            load();
          }
        },
      )
      .subscribe();

    return () => {
      unsub();
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const handleTakePackage = async (job) => {
    if (dispatchMode === 'admin_only' && (job.service_type === 'service' || !job.service_type)) {
      toast.error('Pekerjaan servis ditugaskan langsung oleh Admin Wira.');
      return;
    }
    setTakingId(job.id);
    try {
      const n = await takePackage(supabase, job.package_id);
      toast.success(`${n} kunjungan paket diambil. Cek jadwalnya di menu Jadwal.`);
      navigate(`/order/${job.id}`);
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengambil paket');
      load();
    } finally {
      setTakingId(null);
    }
  };

  const handleTake = async (job) => {
    if (dispatchMode === 'admin_only' && (job.service_type === 'service' || !job.service_type)) {
      toast.error('Pekerjaan servis ditugaskan langsung oleh Admin Wira.');
      return;
    }
    setTakingId(job.id);
    try {
      await takeJob(supabase, job.id, user.id);
      toast.success('Pekerjaan diambil. Datang sesuai jadwal ya!');
      navigate(`/order/${job.id}`);
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengambil pekerjaan');
      load();
    } finally {
      setTakingId(null);
    }
  };

  const active = myJobs.filter((o) => ACTIVE_VISIT_STATUSES.includes(o.status)).sort(byVisitTime);
  const history = myJobs.filter((o) => ['completed', 'cancelled'].includes(o.status));
  const lists = { open: openJobs, active, history };
  const list = lists[tab];
  const openPage = (job) => navigate(`/order/${job.id}`);

  const empty = {
    open: { icon: <Inbox size={24} />, title: 'Belum ada pekerjaan baru', description: 'Pekerjaan sesuai keahlian Anda muncul di sini begitu pelanggan memesan.' },
    active: { icon: <Wrench size={24} />, title: 'Tidak ada pekerjaan aktif', description: 'Pekerjaan yang Anda ambil muncul di sini sampai selesai.' },
    history: { icon: <History size={24} />, title: 'Belum ada riwayat' },
  }[tab];

  return (
    <div className="flex flex-col gap-5 pb-20">
      <PageHeader title="Pekerjaan" className="mb-0" />
      <Segmented
        ariaLabel="Jenis pekerjaan"
        value={tab}
        onChange={setTab}
        scroll
        className="w-full"
        options={[
          { value: 'open', label: `Tersedia${dispatchMode !== 'admin_only' && openJobs.length ? ` (${openJobs.length})` : ''}` },
          { value: 'active', label: `Aktif${active.length ? ` (${active.length})` : ''}` },
          { value: 'projects', label: `Proyek${projects.filter((p) => p.status === 'open' && !p.my_quote_id).length ? ` (${projects.filter((p) => p.status === 'open' && !p.my_quote_id).length})` : ''}` },
          { value: 'history', label: 'Riwayat' },
        ]}
      />

      {tab === 'projects' ? (
        loading ? (
          <div className="flex justify-center py-12 text-brand-ink"><Spinner size={24} label="Memuat proyek" /></div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={24} />}
            title="Belum ada proyek"
            description="Proyek besar sesuai keahlian Anda muncul di sini. Hanya teknisi terverifikasi yang bisa mengajukan penawaran."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <Card key={p.id} as="button" type="button" onClick={() => navigate(`/technician/projects/${p.id}`)} className="flex w-full flex-col items-start gap-1.5 text-left transition-colors hover:bg-sunken/40">
                <span className="flex flex-wrap items-center gap-1.5">
                  {p.awarded_to_me ? <Badge tone="success" dot>Proyek Anda</Badge>
                    : p.my_quote_id ? <Badge tone="warning" dot>Penawaran {p.my_quote_status === 'submitted' ? 'terkirim' : p.my_quote_status}</Badge>
                    : <Badge tone="brand" dot>Terbuka</Badge>}
                  <span className="text-[12px] text-ink-muted">{p.area} · {p.quote_count} penawaran</span>
                </span>
                <span className="text-[15px] font-bold text-ink">{p.title}</span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-muted">{p.description}</span>
                {(p.budget_min || p.budget_max) && (
                  <span className="text-[12.5px] text-ink">Anggaran <Money value={Number(p.budget_min || 0)} /> – <Money value={Number(p.budget_max || p.budget_min)} /></span>
                )}
              </Card>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-12 text-brand-ink"><Spinner size={24} label="Memuat pekerjaan" /></div>
      ) : (
        <>
          {tab === 'open' && dispatchMode === 'admin_only' && (
            <Notice tone="brand">Pekerjaan servis ditugaskan langsung oleh Admin Wira.</Notice>
          )}
          {list.length > 0 ? (
            <div className="flex flex-col gap-3">
              {(tab === 'open' ? groupOpenJobs(list) : list.map((job) => ({ job, packageCount: 0 }))).map(({ job, packageCount }) => (
                <VisitJobCard
                  key={job.id}
                  order={job}
                  mode={tab === 'open' ? 'open' : 'own'}
                  skillName={nameOf(orderSkill(job))}
                  taking={takingId === job.id}
                  packageCount={packageCount}
                  onTake={handleTake}
                  onTakePackage={handleTakePackage}
                  onOpen={openPage}
                />
              ))}
            </div>
          ) : tab === 'open' && dispatchMode === 'admin_only' ? null : (
            <EmptyState {...empty} />
          )}
        </>
      )}
    </div>
  );
};
export default TechOrdersPage;
