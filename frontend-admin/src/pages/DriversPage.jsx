import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, reviewApplication } from '../services/mitraApplicationService';
import { setUserBlocked } from '../services/partnerAdminService';
import ReasonSheet from '../components/common/ReasonSheet';
import { Link } from 'react-router-dom';
import { Car, Package, Utensils, Ban, CheckCircle, Eye, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, IconTile, ListRow, PageHeader, Spinner, Stat, Table } from '../components/ui';

// Driver is now one unified mitra_access role covering Ride/Kurir/Makanan
// together (migrations/0033 collapsed the earlier 'driver'/'courier' split
// back into one) - which of those job types a given driver actually
// receives is decided by their own job_type_preferences, not by a second
// mitra_access tag anymore.
const hasAccess = (mitraAccess, role) => {
  if (!mitraAccess) return false;
  if (Array.isArray(mitraAccess)) return mitraAccess.includes(role);
  if (typeof mitraAccess === 'string') return mitraAccess.includes(role);
  return false;
};

const hasJobType = (jobTypePreferences, jobType) => Array.isArray(jobTypePreferences) && jobTypePreferences.includes(jobType);

const DriversPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: allUsers, error: activeErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (activeErr) throw activeErr;
      if (allUsers) {
        const activeMitras = allUsers.filter(u => hasAccess(u.mitra_access, 'driver'));
        setDrivers(activeMitras);
      }

      // The merged registration form (RegisterPage.jsx) only ever writes
      // role: 'driver' now - 'courier' is matched defensively for any
      // application submitted before migrations/0033.
      setPendingDrivers(await fetchPendingApplications(['driver', 'courier']));
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
      await reviewApplication(id, accept, notes);
      toast.success(accept ? 'Driver disetujui. Pendaftar diberi tahu lewat notifikasi.' : 'Pendaftaran ditolak; alasannya dikirim ke pendaftar.');
      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi');
    }
  };

  // Step 1: ask for confirmation before blocking/unblocking - this used to
  // fire immediately on one icon click, but blocking a driver mid-shift is
  // immediately consequential to them (an active ride/delivery, income).
  const toggleStatus = (id, currentStatus) => {
    const driver = drivers.find(d => d.id === id);
    setBlockTarget({ id, name: driver?.name || 'driver ini', currentStatus: currentStatus || 'Aktif' });
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

  const blockedCount = drivers.filter(d => (d.status || 'Aktif') !== 'Aktif').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Manajemen Driver & Kurir"
        subtitle="Daftar Mitra Pengemudi (Ride) & Kurir (Send) Wira"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Driver terdaftar" value={loading ? '–' : drivers.length} icon={<Car size={18} />} />
        <Stat label="Diblokir" value={loading ? '–' : blockedCount} icon={<Ban size={18} />} tone="danger" />
        <Stat label="Perlu Persetujuan" value={loading ? '–' : pendingDrivers.length} icon={<Clock size={18} />} tone="neutral" />
      </div>

      {/* Antrean Persetujuan (Hanya muncul jika ada) */}
      {pendingDrivers.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-[15px] font-bold tracking-tight text-ink">Perlu Persetujuan</h2>
            <Badge tone="warning" dot>{pendingDrivers.length} menunggu</Badge>
          </div>
          <ul className="divide-y divide-line">
            {pendingDrivers.map(pending => (
              <li key={pending.id}>
                <ListRow
                  className="px-4 py-3"
                  leading={<IconTile tone="neutral" size="sm"><Car size={17} /></IconTile>}
                  title={(
                    <span className="flex flex-wrap items-center gap-2">
                      {pending.name}
                      <Badge tone="brand">Driver{pending.vehicle_type === 'mobil' ? ' (Mobil)' : ''}</Badge>
                    </span>
                  )}
                  subtitle={<>{pending.vehicle} - <span className="font-mono">{pending.plate}</span></>}
                  trailing={(
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Eye size={15} />}
                      onClick={() => { setSelectedDriver(pending); setIsReviewOpen(true); }}
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
              <th>Nama Driver</th>
              <th>Layanan</th>
              <th>Email</th>
              <th>Telepon</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => {
              const isActive = (d.status || 'Aktif') === 'Aktif';
              return (
                <tr key={d.id}>
                  <td className="font-semibold"><Link to={`/partners/${d.id}`} className="hover:underline">{d.name}</Link></td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {hasJobType(d.job_type_preferences, 'ride') && (
                        <Badge tone="brand"><Car size={12} aria-hidden="true" /> Ride</Badge>
                      )}
                      {hasJobType(d.job_type_preferences, 'send') && (
                        <Badge tone="brand"><Package size={12} aria-hidden="true" /> Kurir</Badge>
                      )}
                      {hasJobType(d.job_type_preferences, 'food') && (
                        <Badge tone="brand"><Utensils size={12} aria-hidden="true" /> Makanan</Badge>
                      )}
                      <Badge tone="neutral">{d.vehicle_type === 'mobil' ? 'Mobil' : 'Motor'}</Badge>
                    </div>
                  </td>
                  <td className="text-ink-muted">{d.email}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">{d.phone}</td>
                  <td>
                    <Badge tone={isActive ? 'success' : 'danger'} dot>{d.status || 'Aktif'}</Badge>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant={isActive ? 'danger-soft' : 'secondary'}
                      leftIcon={isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                      onClick={() => toggleStatus(d.id, d.status || 'Aktif')}
                    >
                      {isActive ? 'Tangguhkan' : 'Aktifkan'}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {drivers.length === 0 && (
              <tr>
                <td colSpan="6" className="py-10 text-center text-ink-muted">Tidak ada pengemudi atau kurir aktif</td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {selectedDriver && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedDriver}
          onVerify={handleVerify}
        />
      )}

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
export default DriversPage;
