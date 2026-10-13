import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Inbox, Eye } from 'lucide-react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, reviewApplication, subscribeToApplications } from '../services/mitraApplicationService';
import { applicationKind, KIND_META } from '../services/peopleAdminService';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Spinner, Table } from '../components/ui';
import { formatDateTime } from '../utils/datetime';

const KINDS = ['driver', 'merchant', 'villa', 'technician'];

const summary = (a) => {
  const kind = applicationKind(a);
  if (kind === 'driver') return [a.vehicle_type === 'mobil' ? 'Mobil' : 'Motor', a.vehicle, a.plate].filter(Boolean).join(' · ');
  if (kind === 'merchant' || kind === 'villa') return [a.restaurant_name, a.address].filter(Boolean).join(' · ');
  if (kind === 'technician') return [Array.isArray(a.skills) ? a.skills.join(', ') : a.specialization, a.experience && `${a.experience} th`].filter(Boolean).join(' · ');
  return '';
};

const docs = (a) => {
  const list = [a.ktp_photo && 'KTP', a.selfie_photo && 'selfie', a.sim_photo && (applicationKind(a) === 'driver' ? 'SIM/STNK' : 'dokumen')].filter(Boolean);
  return list.length ? `${list.join(', ')} ✓` : 'Belum ada dokumen';
};

/**
 * Pendaftaran: the one place partners are approved, for every kind. Approving
 * runs admin_review_application (0101): access, restaurant/villa row,
 * technician profile, notification and audit log in one transaction.
 */
export default function ApplicationsPage() {
  const [rows, setRows] = useState(null);
  const [existing, setExisting] = useState({});
  const [kind, setKind] = useState('all');
  const [review, setReview] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchPendingApplications(null);
      setRows(list);
      const ids = list.map((a) => a.auth_id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase.from('users').select('id, created_at, mitra_access').in('id', ids);
        setExisting(Object.fromEntries((data || []).map((u) => [u.id, u])));
      }
    } catch (err) {
      toast.error(`Gagal memuat pendaftaran: ${err.message}`);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
    return subscribeToApplications('applications-page', load);
  }, [load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(KINDS.map((k) => [k, 0]));
    (rows || []).forEach((a) => { const k = applicationKind(a); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [rows]);

  const shown = (rows || []).filter((a) => kind === 'all' || applicationKind(a) === kind);

  const handleVerify = async (id, accept, notes = '') => {
    try {
      await reviewApplication(id, accept, notes);
      toast.success(accept ? 'Disetujui. Pendaftar diberi tahu lewat notifikasi.' : 'Ditolak; alasannya dikirim ke pendaftar.');
      setReview(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal memproses pendaftaran');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Pendaftaran Mitra"
        subtitle="Satu-satunya jalan menjadi mitra. Cek data dan dokumen, lalu setujui atau tolak dengan alasan. Pengasuh diberi aksesnya dari Profil Akun."
      />

      <Segmented
        scroll
        ariaLabel="Jenis mitra"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all', label: `Semua ${rows ? rows.length : ''}`.trim() },
          ...KINDS.map((k) => ({ value: k, label: `${KIND_META[k].label} ${counts[k] || 0}` })),
        ]}
      />

      {rows === null ? (
        <Card className="flex min-h-[140px] items-center justify-center"><Spinner /></Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox size={24} />} title="Tidak ada pendaftar yang menunggu" description="Pendaftar baru dari mitra.wira.one/gabung muncul di sini." />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Pendaftar</th>
                <th>Data</th>
                <th>Dokumen</th>
                <th>Masuk</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const k = applicationKind(a);
                const acct = existing[a.auth_id];
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-semibold text-ink">{a.name || a.restaurant_name || 'Tanpa nama'}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
                          <Badge tone="brand">{KIND_META[k]?.label || k}</Badge>
                          {a.phone && <span className="font-mono">{a.phone}</span>}
                          {acct && <span>· sudah punya akun{(acct.mitra_access || []).length ? ` (${acct.mitra_access.map((x) => KIND_META[x]?.label || x).join(', ')})` : ''}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[280px] text-[13px] text-ink-muted">{summary(a) || '–'}</td>
                    <td className="text-[13px] text-ink-muted">{docs(a)}</td>
                    <td className="whitespace-nowrap text-[13px] text-ink-muted">{formatDateTime(a.created_at)}</td>
                    <td className="text-right">
                      <Button size="sm" variant="primary" leftIcon={<Eye size={15} />} onClick={() => setReview(a)}>Periksa</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {review && (
        <MitraReviewModal isOpen={!!review} onClose={() => setReview(null)} mitra={review} onVerify={handleVerify} />
      )}
    </div>
  );
}
