import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Wrench, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState, PageHeader, Segmented, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  ACTIVE_VISIT_STATUSES, fetchMyJobs, fetchOpenJobs, subscribeToVisitChanges, takeJob, visitInfo, takePackage, groupOpenJobs,
} from '../../services/technicianService';
import VisitJobCard from '../../components/shared/VisitJobCard';
import useSkills, { orderSkill } from '../../hooks/useSkills';

const byVisitTime = (a, b) => (visitInfo(a).when?.getTime() ?? Infinity) - (visitInfo(b).when?.getTime() ?? Infinity);

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

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [open, mine] = await Promise.all([fetchOpenJobs(supabase), fetchMyJobs(supabase, user.id)]);
      setOpenJobs(open);
      setMyJobs(mine);
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
    return subscribeToVisitChanges(supabase, user.id, load);
  }, [user, load]);

  const handleTakePackage = async (job) => {
    setTakingId(job.id);
    try {
      const n = await takePackage(supabase, job.package_id);
      toast.success(`${n} kunjungan paket diambil. Cek jadwalnya di menu Jadwal.`);
      navigate(`/technician/active-order/${job.id}`);
    } catch (err) {
      toast.error(err.message || 'Gagal mengambil paket');
      load();
    } finally {
      setTakingId(null);
    }
  };

  const handleTake = async (job) => {
    setTakingId(job.id);
    try {
      await takeJob(supabase, job.id, user.id);
      toast.success('Pekerjaan diambil. Datang sesuai jadwal ya!');
      navigate(`/technician/active-order/${job.id}`);
    } catch (err) {
      toast.error(err.message || 'Gagal mengambil pekerjaan');
      load();
    } finally {
      setTakingId(null);
    }
  };

  const active = myJobs.filter((o) => ACTIVE_VISIT_STATUSES.includes(o.status)).sort(byVisitTime);
  const history = myJobs.filter((o) => ['completed', 'cancelled'].includes(o.status));
  const lists = { open: openJobs, active, history };
  const list = lists[tab];
  const openPage = (job) => navigate(`/technician/active-order/${job.id}`);

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
        className="w-full"
        options={[
          { value: 'open', label: `Tersedia${openJobs.length ? ` (${openJobs.length})` : ''}` },
          { value: 'active', label: `Aktif${active.length ? ` (${active.length})` : ''}` },
          { value: 'history', label: 'Riwayat' },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-12 text-brand-ink"><Spinner size={24} label="Memuat pekerjaan" /></div>
      ) : list.length > 0 ? (
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
      ) : (
        <EmptyState {...empty} />
      )}
    </div>
  );
};
export default TechOrdersPage;
