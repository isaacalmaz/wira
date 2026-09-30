import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, setApplicationStatus } from '../services/mitraApplicationService';
import { Wrench, Ban, CheckCircle, Eye, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, IconTile, ListRow, PageHeader, Spinner, Stat, Table } from '../components/ui';

const TechniciansPage = () => {
  const [techs, setTechs] = useState([]);
  const [pendingTechs, setPendingTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);

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
      if (accept) {
        const pending = pendingTechs.find(m => m.id === id);
        if (pending && pending.auth_id) {
          const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
          if (profileErr) throw profileErr;

          let currentAccess = userProfile?.mitra_access || [];
          if (!currentAccess.includes('technician')) currentAccess.push('technician');

          if (userProfile) {
            const { error: updateErr, data: updatedUser } = await supabase.from('users').update({
              mitra_access: currentAccess,
              status: 'Aktif'
            }).eq('id', pending.auth_id).select();
            if (updateErr) throw updateErr;
            if (!updatedUser || updatedUser.length === 0) {
              throw new Error("Gagal! Akses ditolak oleh sistem keamanan RLS Supabase.");
            }
          } else {
            const { error: insertErr } = await supabase.from('users').insert([{
              id: pending.auth_id,
              name: pending.name,
              email: pending.email,
              phone: pending.phone,
              role: 'mitra',
              status: 'Aktif',
              mitra_access: currentAccess
            }]);
            if (insertErr) throw insertErr;
          }
        }
        toast.success('Teknisi berhasil disetujui!');
      } else {
        toast.success('Pendaftaran ditolak.');
      }

      // Only mark the registration handled after the write above actually
      // succeeded - if it threw, the registration stays 'Pending' so it's
      // still visible to retry, instead of looking silently "done" with no
      // real mitra_access grant.
      await setApplicationStatus(id, accept, notes);

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
  const confirmToggleStatus = async () => {
    if (!blockTarget) return;
    const { id, currentStatus } = blockTarget;
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    try {
      const { error, data } = await supabase.from('users').update({ status: newStatus }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success(`Status diubah menjadi ${newStatus}`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status');
    } finally {
      setBlockTarget(null);
    }
  };

  const blockedCount = techs.filter(t => (t.status || 'Aktif') !== 'Aktif').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title="Manajemen Teknisi" subtitle="Daftar Mitra Jasa Servis" />

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
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {techs.map(t => {
              const isActive = (t.status || 'Aktif') === 'Aktif';
              return (
                <tr key={t.id}>
                  <td className="font-semibold">{t.name}</td>
                  <td className="text-ink-muted">{t.email}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">{t.phone}</td>
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
                      {isActive ? 'Blokir' : 'Aktifkan'}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {techs.length === 0 && (
              <tr>
                <td colSpan="5" className="py-10 text-center text-ink-muted">Tidak ada teknisi aktif</td>
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

      <ConfirmModal
        isOpen={!!blockTarget}
        tone={blockTarget?.currentStatus === 'Aktif' ? 'danger' : 'default'}
        confirmLabel={blockTarget?.currentStatus === 'Aktif' ? 'Blokir' : 'Aktifkan'}
        title={blockTarget?.currentStatus === 'Aktif' ? 'Blokir Teknisi' : 'Aktifkan Kembali Teknisi'}
        message={blockTarget ? (
          blockTarget.currentStatus === 'Aktif'
            ? `Anda akan memblokir "${blockTarget.name}". Teknisi ini tidak akan bisa menerima order jasa servis baru sampai diaktifkan kembali.`
            : `Anda akan mengaktifkan kembali "${blockTarget.name}". Teknisi ini akan bisa menerima order lagi.`
        ) : ''}
        onConfirm={confirmToggleStatus}
        onCancel={() => setBlockTarget(null)}
      />
    </div>
  );
};
export default TechniciansPage;
