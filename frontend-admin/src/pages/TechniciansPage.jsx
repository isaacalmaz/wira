import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, reviewApplication } from '../services/mitraApplicationService';
import { setUserBlocked } from '../services/partnerAdminService';
import ReasonSheet from '../components/common/ReasonSheet';
import { Link } from 'react-router-dom';
import { Wrench, Ban, CheckCircle, Eye, Clock, CheckCircle2, Pencil, Star } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, IconTile, ListRow, PageHeader, Sheet, Spinner, Stat, Table, cx } from '../components/ui';

const SKILL_GROUPS = [
  { group: 'servis', title: 'Servis harian', hint: 'harga tetap, dipesan langsung' },
  { group: 'proyek', title: 'Proyek & renovasi', hint: 'lewat penawaran harga' },
];

const TechniciansPage = () => {
  const [techs, setTechs] = useState([]);
  const [pendingTechs, setPendingTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  // Skills (migrations/0089): what each technician is offered.
  const [skillList, setSkillList] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [ratings, setRatings] = useState({}); // migrations/0091
  const [skillTarget, setSkillTarget] = useState(null); // { id, name, skills }
  const [savingSkills, setSavingSkills] = useState(false);
  const skillName = (code) => skillList.find((sk) => sk.code === code)?.name || code;

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (activeErr) throw activeErr;
      if (allUsers) {
        const activeMitras = allUsers.filter(u => {
          if (!u.mitra_access) return false;
          if (Array.isArray(u.mitra_access)) return u.mitra_access.includes('technician');
          if (typeof u.mitra_access === 'string') return u.mitra_access.includes('technician');
          return false;
        });
        setTechs(activeMitras);
      }

      setPendingTechs(await fetchPendingApplications(['technician']));

      // Before 0089 these tables don't exist yet; the page still works.
      const [{ data: skillRows }, { data: profileRows }] = await Promise.all([
        supabase.from('service_skills').select('code, name, skill_group, sort_order, is_active').order('sort_order'),
        supabase.from('technician_profiles').select('user_id, skills, is_accepting, verified_at'),
      ]);
      setSkillList((skillRows || []).filter((sk) => sk.is_active));
      setProfiles(Object.fromEntries((profileRows || []).map((p) => [p.user_id, p])));
      const { data: ratingRows } = await supabase.rpc('admin_technician_ratings');
      setRatings(Object.fromEntries((ratingRows || []).map((r) => [r.user_id, r])));
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleVerify = async (id, accept, notes = '') => {
    try {
      // KTP + selfie reviewed in the modal: approving also verifies the
      // technician (done inside admin_review_application, migrations/0101).
      await reviewApplication(id, accept, notes);
      toast.success(accept ? 'Teknisi disetujui. Pendaftar diberi tahu lewat notifikasi.' : 'Pendaftaran ditolak; alasannya dikirim ke pendaftar.');
      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi');
    }
  };

  // Step 1: ask for confirmation before blocking/unblocking - this used to
  // fire immediately on one icon click, but blocking a technician
  // mid-job is immediately consequential to them.
  const toggleStatus = (id, currentStatus) => {
    const tech = techs.find(t => t.id === id);
    setBlockTarget({ id, name: tech?.name || 'teknisi ini', currentStatus: currentStatus || 'Aktif' });
  };

  // Step 2: only reached after the operator confirms in the ConfirmModal.
  const confirmToggleStatus = async (reason) => {
    if (!blockTarget) return;
    const { id, currentStatus } = blockTarget;
    try {
      // admin_set_user_status (migrations/0101): reason sent to the partner
      // and kept in the audit log.
      const next = await setUserBlocked(id, currentStatus === 'Aktif', reason);
      toast.success(next === 'Diblokir' ? 'Akun ditangguhkan' : 'Akun aktif kembali');
      setBlockTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status');
    }
  };

  const saveSkills = async () => {
    if (!skillTarget) return;
    setSavingSkills(true);
    try {
      // Update when the profile exists (technicians only get column-level
      // UPDATE on skills/is_accepting, so no upsert), insert otherwise.
      const query = profiles[skillTarget.id]
        ? supabase.from('technician_profiles').update({ skills: skillTarget.skills }).eq('user_id', skillTarget.id)
        : supabase.from('technician_profiles').insert({ user_id: skillTarget.id, skills: skillTarget.skills });
      const { data, error } = await query.select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak saat menyimpan keahlian.');
      toast.success(`Keahlian ${skillTarget.name} disimpan`);
      setSkillTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menyimpan keahlian');
    } finally {
      setSavingSkills(false);
    }
  };

  const toggleVerified = async (t) => {
    const next = !profiles[t.id]?.verified_at;
    const { error } = await supabase.rpc('admin_set_technician_verified', { p_user_id: t.id, p_verified: next });
    if (error) { toast.error(error.message || 'Gagal mengubah verifikasi'); return; }
    toast.success(next ? `${t.name} ditandai terverifikasi` : `Verifikasi ${t.name} dicabut`);
    fetchData();
  };

  const toggleTargetSkill = (code) => setSkillTarget((t) => ({
    ...t,
    skills: t.skills.includes(code) ? t.skills.filter((c) => c !== code) : [...t.skills, code],
  }));

  const blockedCount = techs.filter(t => (t.status || 'Aktif') !== 'Aktif').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title="Teknisi" subtitle="Daftar Mitra Jasa Servis" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Teknisi terdaftar" value={loading ? '–' : techs.length} icon={<Wrench size={18} />} />
        <Stat label="Diblokir" value={loading ? '–' : blockedCount} icon={<Ban size={18} />} tone="danger" />
        <Stat label="Perlu Persetujuan" value={loading ? '–' : pendingTechs.length} icon={<Clock size={18} />} tone="neutral" />
      </div>

      {/* Antrean Persetujuan (Hanya muncul jika ada) */}
      {pendingTechs.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-[15px] font-bold tracking-tight text-ink">Perlu Persetujuan</h2>
            <Badge tone="warning" dot>{pendingTechs.length} menunggu</Badge>
          </div>
          <ul className="divide-y divide-line">
            {pendingTechs.map(pending => (
              <li key={pending.id}>
                <ListRow
                  className="px-4 py-3"
                  leading={<IconTile tone="neutral" size="sm"><Wrench size={17} /></IconTile>}
                  title={pending.name}
                  subtitle={`${pending.specialization} - ${pending.experience}`}
                  trailing={(
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Eye size={15} />}
                      onClick={() => { setSelectedTech(pending); setIsReviewOpen(true); }}
                    >
                      Tinjau
                    </Button>
                  )}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner size={16} /> Memuat...
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Nama Teknisi</th>
              <th>Email</th>
              <th>Telepon</th>
              <th>Keahlian</th>
              <th>Rating</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {techs.map(t => {
              const isActive = (t.status || 'Aktif') === 'Aktif';
              return (
                <tr key={t.id}>
                  <td className="font-semibold">
                    <div className="flex flex-col items-start gap-1">
                      <Link to={`/partners/${t.id}`} className="hover:underline">{t.name}</Link>
                      {profiles[t.id] && (
                        <button
                          type="button"
                          onClick={() => toggleVerified(t)}
                          title={profiles[t.id].verified_at ? 'Cabut verifikasi' : 'Tandai terverifikasi (KTP & selfie sudah dicek)'}
                          className="min-h-8"
                        >
                          <Badge tone={profiles[t.id].verified_at ? 'success' : 'neutral'}>
                            {profiles[t.id].verified_at ? 'Terverifikasi' : 'Belum verifikasi'}
                          </Badge>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="text-ink-muted">{t.email}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">{t.phone}</td>
                  <td>
                    <div className="flex max-w-xs flex-wrap items-center gap-1">
                      {(profiles[t.id]?.skills || []).length > 0
                        ? profiles[t.id].skills.map((code) => <Badge key={code} tone="brand">{skillName(code)}</Badge>)
                        : <Badge tone="warning">Belum diatur</Badge>}
                      {skillList.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Ubah keahlian ${t.name}`}
                          onClick={() => setSkillTarget({ id: t.id, name: t.name, skills: profiles[t.id]?.skills || [] })}
                        >
                          <Pencil size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {ratings[t.id]?.rating_count > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 font-mono text-[13px] font-medium text-ink">
                          <Star size={13} className="fill-pay text-pay" aria-hidden="true" />
                          {Number(ratings[t.id].rating_avg).toFixed(1)}
                          <span className="font-sans text-[12px] text-ink-muted">({ratings[t.id].rating_count})</span>
                        </span>
                        {(ratings[t.id].low_ratings_30d > 0 || (ratings[t.id].rating_count >= 5 && Number(ratings[t.id].recent_avg) < 4.5)) && (
                          <Badge tone="danger">
                            {ratings[t.id].low_ratings_30d > 0 ? `${ratings[t.id].low_ratings_30d} ulasan buruk (30 hari)` : 'Rating turun'}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12.5px] text-ink-muted">Belum ada</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={isActive ? 'success' : 'danger'} dot>{t.status || 'Aktif'}</Badge>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant={isActive ? 'danger-soft' : 'secondary'}
                      leftIcon={isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                      onClick={() => toggleStatus(t.id, t.status || 'Aktif')}
                    >
                      {isActive ? 'Tangguhkan' : 'Aktifkan'}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {techs.length === 0 && (
              <tr>
                <td colSpan="7" className="py-10 text-center text-ink-muted">Tidak ada teknisi aktif</td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {selectedTech && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedTech}
          onVerify={handleVerify}
        />
      )}

      <Sheet
        open={!!skillTarget}
        onClose={() => { if (!savingSkills) setSkillTarget(null); }}
        dismissible={!savingSkills}
        title={`Keahlian ${skillTarget?.name || ''}`}
        description="Teknisi hanya ditawari pekerjaan sesuai keahlian yang dicentang. Tanpa keahlian, teknisi tidak menerima pekerjaan."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setSkillTarget(null)} disabled={savingSkills}>Batal</Button>
            <Button onClick={saveSkills} isLoading={savingSkills}>Simpan</Button>
          </>
        )}
      >
        {skillTarget && (
          <div className="flex flex-col gap-4">
            {SKILL_GROUPS.map(({ group, title, hint }) => (
              <fieldset key={group} className="flex flex-col gap-2">
                <legend className="text-[13px] font-semibold text-ink">{title} <span className="font-normal text-ink-muted">· {hint}</span></legend>
                <div className="flex flex-wrap gap-2 pt-1">
                  {skillList.filter((sk) => sk.skill_group === group).map((sk) => {
                    const on = skillTarget.skills.includes(sk.code);
                    return (
                      <button
                        key={sk.code}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleTargetSkill(sk.code)}
                        className={cx(
                          'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                          on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-line-strong',
                        )}
                      >
                        {on && <CheckCircle2 size={15} aria-hidden="true" />}
                        {sk.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </Sheet>

      <ReasonSheet
        open={!!blockTarget}
        tone={blockTarget?.currentStatus === 'Aktif' ? 'danger' : 'default'}
        confirmLabel={blockTarget?.currentStatus === 'Aktif' ? 'Tangguhkan' : 'Aktifkan'}
        title={blockTarget ? (blockTarget.currentStatus === 'Aktif' ? `Tangguhkan ${blockTarget.name}?` : `Aktifkan lagi ${blockTarget.name}?`) : ''}
        description={blockTarget?.currentStatus === 'Aktif'
          ? 'Akun tidak bisa masuk ke Wira Mitra dan tidak ditawari pesanan baru. Pesanan yang sedang berjalan tidak otomatis dibatalkan; tangani dari halaman Orders.'
          : 'Akun bisa masuk dan menerima pesanan lagi.'}
        onClose={() => setBlockTarget(null)}
        onConfirm={confirmToggleStatus}
      />
    </div>
  );
};
export default TechniciansPage;
