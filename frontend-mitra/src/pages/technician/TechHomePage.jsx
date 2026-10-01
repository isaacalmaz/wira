import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Badge, Button, Money, Stat, SectionHeader, EmptyState, Notice, cx } from '../../components/ui';
import { Calendar, BellRing, Wallet, Inbox, ChevronRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { technicianEarnedAmount } from '../../services/orderService';
import {
  ACTIVE_VISIT_STATUSES, fetchMyJobs, fetchMyTechnicianProfile, fetchOpenJobs, setAccepting,
  subscribeToVisitChanges, takeJob, visitInfo, takePackage, groupOpenJobs,
} from '../../services/technicianService';
import VisitJobCard from '../../components/shared/VisitJobCard';
import useSkills, { orderSkill } from '../../hooks/useSkills';

/** Rupiah that can be negative (Tunai orders net the commission out of the
 * saldo), rounded the same way formatSignedRupiah does. */
const SignedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return <Money value={n} sign={n < 0 ? 'minus' : undefined} className={className} />;
};

/** The accepting-jobs switch: a 44px touch target around a 48x28 track. */
const OnlineSwitch = ({ isOnline, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={isOnline}
    disabled={disabled}
    onClick={() => onChange(!isOnline)}
    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
  >
    <span className="sr-only">Terima pekerjaan baru</span>
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-150',
        isOnline ? 'border-success bg-success' : 'border-line-strong bg-sunken',
      )}
    >
      <span
        className={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.3)] transition-transform duration-150',
          isOnline ? 'translate-x-[23px]' : 'translate-x-[3px]',
        )}
      />
    </span>
  </button>
);

const dayKey = (d) => d.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' });

const TechHomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { nameOf } = useSkills();
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [openJobs, setOpenJobs] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [takingId, setTakingId] = useState(null);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const knownOpen = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [open, mine] = await Promise.all([fetchOpenJobs(supabase), fetchMyJobs(supabase, user.id)]);
      // A new job appeared since the last refresh: say so.
      if (knownOpen.current && open.some((j) => !knownOpen.current.has(j.id))) {
        toast.success('Ada pekerjaan baru untuk Anda');
      }
      knownOpen.current = new Set(open.map((j) => j.id));
      setOpenJobs(open);
      setMyJobs(mine);
    } catch (err) {
      console.error('Technician home load failed:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    fetchMyTechnicianProfile(supabase, user.id)
      .then(setProfile)
      .catch((err) => console.error('Technician profile load failed:', err))
      .finally(() => setProfileLoaded(true));
    load();
    return subscribeToVisitChanges(supabase, user.id, load);
  }, [user, load]);

  const toggleAccepting = async (next) => {
    if (!user || !profile) return;
    setSavingSwitch(true);
    try {
      const value = await setAccepting(supabase, user.id, next);
      setProfile((p) => ({ ...p, is_accepting: value }));
      toast.success(value ? 'Anda akan menerima notifikasi pekerjaan baru' : 'Notifikasi pekerjaan baru dimatikan');
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status');
    } finally {
      setSavingSwitch(false);
    }
  };

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
    if (!user) return;
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

  // Earnings by the day the job was finished, in Lombok time.
  const today = dayKey(new Date());
  const weekAgo = Date.now() - 7 * 86400000;
  let todayEarnings = 0;
  let weekEarnings = 0;
  myJobs.filter((o) => o.status === 'completed').forEach((o) => {
    const done = new Date(o.status_changed_at || o.created_at);
    const amount = technicianEarnedAmount(o);
    if (dayKey(done) === today) todayEarnings += amount;
    if (done.getTime() >= weekAgo) weekEarnings += amount;
  });

  const upcoming = myJobs
    .filter((o) => ACTIVE_VISIT_STATUSES.includes(o.status))
    .sort((a, b) => (visitInfo(a).when?.getTime() ?? Infinity) - (visitInfo(b).when?.getTime() ?? Infinity));

  const accepting = profile?.is_accepting ?? false;
  const skills = profile?.skills || [];

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="break-words text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance sm:text-2xl">Halo, {user?.name || 'Mitra Teknisi'}!</h1>
        <p className="text-sm text-ink-muted">Mitra Jasa Servis Wira</p>
      </div>

      {profileLoaded && profile && skills.length === 0 && (
        <Notice tone="warning">
          Keahlian Anda belum diatur, jadi belum ada pekerjaan yang bisa Anda terima. Hubungi admin Wira lewat menu Bantuan.
        </Notice>
      )}

      <Card padding="none" className="flex flex-col">
        <div className="flex items-center gap-3 py-2 pl-4 pr-2">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Notifikasi Pekerjaan Baru</span>
            <Badge tone={accepting ? 'success' : 'neutral'} dot>{!profileLoaded ? 'Memuat...' : accepting ? 'Aktif' : 'Nonaktif'}</Badge>
          </div>
          <OnlineSwitch isOnline={accepting} onChange={toggleAccepting} disabled={!profile || savingSwitch} />
        </div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3">
            {skills.map((code) => <Badge key={code} tone="brand">{nameOf(code)}</Badge>)}
          </div>
        )}
      </Card>

      <Stat
        label="Pendapatan Hari Ini"
        value={<SignedMoney value={todayEarnings} />}
        icon={<Wallet size={18} />}
        tone="pay"
        hint={<>7 hari terakhir: <SignedMoney value={weekEarnings} className="font-medium text-ink" /></>}
      />

      <section>
        <SectionHeader
          title={<span className="inline-flex items-center gap-2"><BellRing size={18} className="text-brand-ink" aria-hidden="true" /> Pekerjaan Tersedia</span>}
          action={openJobs.length > 3 ? (
            <Button variant="ghost" size="sm" rightIcon={<ChevronRight size={16} />} onClick={() => navigate('/technician/orders')}>
              Semua ({openJobs.length})
            </Button>
          ) : null}
        />
        {openJobs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groupOpenJobs(openJobs).slice(0, 3).map(({ job, packageCount }) => (
              <VisitJobCard
                key={job.id}
                order={job}
                mode="open"
                skillName={nameOf(orderSkill(job))}
                taking={takingId === job.id}
                packageCount={packageCount}
                onTake={handleTake}
                onTakePackage={handleTakePackage}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox size={24} />}
            title="Belum ada pekerjaan baru"
            description="Pekerjaan sesuai keahlian Anda muncul di sini, dan kami kirim notifikasi saat ada yang baru."
          />
        )}
      </section>

      <section>
        <SectionHeader title={<span className="inline-flex items-center gap-2"><Calendar size={18} className="text-ink-muted" aria-hidden="true" /> Jadwal Berikutnya</span>} />
        {upcoming.length > 0 ? (
          <div className="flex flex-col gap-3">
            {upcoming.map((job) => (
              <VisitJobCard
                key={job.id}
                order={job}
                skillName={nameOf(orderSkill(job))}
                onOpen={() => navigate(`/technician/active-order/${job.id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Calendar size={24} />} title="Belum ada jadwal kunjungan" />
        )}
      </section>
    </div>
  );
};
export default TechHomePage;
