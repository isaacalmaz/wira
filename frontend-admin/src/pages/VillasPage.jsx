import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, RefreshCw, Check, X, MapPin, BedDouble, Users, Building2, FileSearch, UserPlus } from 'lucide-react';
import { supabase } from '../config/supabase';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, EmptyState, Field, Input, Money, PageHeader, Segmented, Sheet, Table, Textarea } from '../components/ui';
import MerchantFormSheet from '../components/common/MerchantFormSheet';
import MitraReviewModal from '../components/common/MitraReviewModal';
import { fetchPendingApplications, reviewApplication } from '../services/mitraApplicationService';
import { toMerchantApplication } from '../services/merchantApprovalService';

const STATUS = {
  pending: { tone: 'warning', label: 'Menunggu' },
  approved: { tone: 'success', label: 'Tayang' },
  rejected: { tone: 'danger', label: 'Ditolak' },
};
const statusOf = (v) => (v.listing_status === 'approved' && v.is_open === false ? { tone: 'neutral', label: 'Dijeda' } : STATUS[v.listing_status] || STATUS.approved);

/**
 * Everything WiraVilla: new host registrations (mitra_applications role
 * 'villa'), properties hosts add from Wira Mitra (migration 0097), which
 * wait here for approval or a rejection with a reason, and every villa.
 */
const VillasPage = () => {
  const [villas, setVillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [applications, setApplications] = useState([]);
  const [reviewApp, setReviewApp] = useState(null);

  const fetchVillas = async (first = false) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('merchants')
      .select('*, owner:owner_id(name, email, phone)')
      .in('service_type', ['villa', 'WiraVilla'])
      .order('created_at', { ascending: false });
    if (error) toast.error('Gagal memuat vila: ' + error.message);
    setVillas(data || []);
    let apps = [];
    try {
      apps = (await fetchPendingApplications(['villa'])).map(toMerchantApplication);
    } catch (err) {
      toast.error('Gagal memuat pendaftar villa: ' + err.message);
    }
    setApplications(apps);
    // Open on whatever is waiting for an admin.
    if (first && apps.length) setTab('applications');
    else if (first && (data || []).some((v) => v.listing_status === 'pending')) setTab('pending');
    setLoading(false);
  };

  useEffect(() => {
    fetchVillas(true);
  }, []);

  const pending = villas.filter((v) => v.listing_status === 'pending');

  const review = async (villa, approve, note = null) => {
    setBusy(villa.id);
    try {
      const { error } = await supabase.rpc('admin_review_villa_listing', { p_id: villa.id, p_approve: approve, p_note: note });
      if (error) throw error;
      toast.success(approve ? `${villa.name} tayang` : `${villa.name} dikembalikan ke pemilik`);
      setRejectTarget(null);
      setReason('');
      fetchVillas();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan keputusan');
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async (id, accept, notes = '') => {
    try {
      const app = applications.find((a) => a.id === id);
      await reviewApplication(id, accept, notes);
      toast.success(accept ? `${app?.name || 'Villa'} disetujui. Pemilik bisa masuk ke portal Villa.` : 'Pendaftaran ditolak.');
      setReviewApp(null);
      fetchVillas();
    } catch (err) {
      toast.error(err.message || 'Gagal memverifikasi pendaftaran');
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error, data } = await supabase.from('merchants').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
      toast.success('Vila berhasil dihapus');
      fetchVillas();
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus vila');
    }
  };

  // Properties per host, so the table reads host by host.
  const perHost = villas.reduce((acc, v) => { acc[v.owner_id || '-'] = (acc[v.owner_id || '-'] || 0) + 1; return acc; }, {});
  const q = searchTerm.toLowerCase();
  const filtered = villas
    .filter((v) => (tab === 'all' ? true : tab === 'rejected' ? v.listing_status === 'rejected' : v.listing_status === 'pending'))
    .filter((v) => (v.name || '').toLowerCase().includes(q) || (v.owner?.name || '').toLowerCase().includes(q))
    .sort((a, b) => (a.owner?.name || '~').localeCompare(b.owner?.name || '~') || (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Manajemen Vila"
        subtitle="Tinjau properti baru dari mitra dan kelola semua vila WiraVilla."
        actions={(
          <>
            <Button variant="secondary" onClick={() => fetchVillas()} aria-label="Muat ulang" className="px-3">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button leftIcon={<Plus size={18} />} onClick={() => setIsAddOpen(true)}>
              Tambah Vila
            </Button>
          </>
        )}
      />

      <Segmented
        scroll
        value={tab}
        onChange={setTab}
        options={[
          { value: 'applications', label: `Pendaftar Baru (${applications.length})` },
          { value: 'pending', label: `Properti Menunggu (${pending.length})` },
          { value: 'all', label: `Semua (${villas.length})` },
          { value: 'rejected', label: 'Ditolak' },
        ]}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
        <Input type="text" aria-label="Cari vila atau pemilik" placeholder="Cari nama vila atau pemilik..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {tab === 'applications' ? (
        applications.length === 0 ? (
          <EmptyState icon={<UserPlus size={22} />} title={loading ? 'Memuat...' : 'Tidak ada pendaftar villa baru'} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {applications.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <h3 className="truncate text-[14px] font-semibold text-ink">{a.name}</h3>
                  <span><Badge tone="warning" dot>Menunggu Verifikasi</Badge></span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-ink-muted">Pemilik</dt>
                  <dd className="min-w-0 truncate text-ink">{a.owner}</dd>
                  <dt className="text-ink-muted">HP</dt>
                  <dd className="min-w-0 truncate font-mono text-ink">{a.phone}</dd>
                  <dt className="text-ink-muted">Lokasi</dt>
                  <dd className="min-w-0 truncate text-ink" title={a.address}>{a.address}</dd>
                </dl>
                <Button variant="secondary" size="sm" block className="mt-auto" leftIcon={<FileSearch size={15} />} onClick={() => setReviewApp(a)}>
                  Review Berkas
                </Button>
              </Card>
            ))}
          </div>
        )
      ) : tab === 'pending' ? (
        filtered.length === 0 ? (
          <EmptyState icon={<Building2 size={22} />} title={loading ? 'Memuat...' : 'Tidak ada properti yang menunggu'} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((v) => (
              <Card key={v.id} padding="none" className="flex flex-col overflow-hidden">
                <div className="flex snap-x gap-1 overflow-x-auto bg-sunken">
                  {(v.photos?.length ? v.photos : [v.image]).filter(Boolean).map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
                      <img src={src} alt="" className="h-36 w-52 object-cover" />
                    </a>
                  ))}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-[15px] font-bold text-ink">{v.name}</h3>
                      <p className="text-[12.5px] text-ink-muted">
                        {v.owner?.name || 'Tanpa pemilik'}{v.owner?.phone ? ` · ${v.owner.phone}` : ''} · {perHost[v.owner_id || '-']} properti
                      </p>
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-[12px] text-ink-muted">
                      <Money value={v.price_per_night || 0} className="text-[15px] font-medium text-ink" />/malam
                    </p>
                  </div>
                  <p className="flex items-start gap-1.5 text-[13px] text-ink-muted"><MapPin size={14} className="mt-[3px] shrink-0" />{v.address || '—'}</p>
                  <p className="flex flex-wrap gap-x-4 text-[13px] text-ink-muted">
                    {v.bedrooms != null && <span className="inline-flex items-center gap-1.5"><BedDouble size={14} />{v.bedrooms} kamar</span>}
                    {v.max_guests != null && <span className="inline-flex items-center gap-1.5"><Users size={14} />maks. {v.max_guests} tamu</span>}
                  </p>
                  {v.amenities?.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {v.amenities.map((a) => <li key={a}><Badge tone="neutral">{a}</Badge></li>)}
                    </ul>
                  )}
                  {v.description && <p className="text-[13px] leading-relaxed text-ink">{v.description}</p>}
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button variant="danger-soft" className="flex-1" leftIcon={<X size={16} />} disabled={busy === v.id} onClick={() => { setReason(''); setRejectTarget(v); }}>
                      Tolak
                    </Button>
                    <Button className="flex-1" leftIcon={<Check size={16} />} isLoading={busy === v.id} onClick={() => review(v, true)}>
                      Setujui & Tayangkan
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Nama Vila</th>
              <th>Pemilik</th>
              <th className="text-right">Harga/malam</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => {
              const st = statusOf(v);
              return (
                <tr key={v.id}>
                  <td>
                    <p className="whitespace-nowrap font-semibold">{v.name}</p>
                    <p className="text-[12px] text-ink-muted">{v.address}</p>
                    {v.listing_status === 'rejected' && v.review_note && <p className="text-[12px] text-danger-ink">Alasan: {v.review_note}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    <p>{v.owner?.name || '—'}</p>
                    {v.owner_id && <p className="text-[12px] text-ink-muted">{perHost[v.owner_id]} properti</p>}
                  </td>
                  <td className="text-right"><Money value={v.price_per_night || 0} /></td>
                  <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                  <td className="text-right">
                    <Button size="sm" variant="danger-soft" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteTarget(v)}>
                      Hapus
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="py-10 text-center text-ink-muted">
                  {loading ? 'Memuat...' : 'Tidak ada vila.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      <Sheet
        open={!!rejectTarget}
        onClose={() => { if (!busy) setRejectTarget(null); }}
        dismissible={!busy}
        tone="danger"
        size="sm"
        icon={<X size={22} />}
        title={rejectTarget ? `Tolak "${rejectTarget.name}"?` : ''}
        description="Pemilik menerima alasan ini, memperbaiki listing, lalu mengajukan ulang."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)} disabled={!!busy}>Batal</Button>
            <Button variant="danger" onClick={() => review(rejectTarget, false, reason)} isLoading={!!busy} disabled={reason.trim().length < 5}>
              Tolak
            </Button>
          </>
        )}
      >
        <Field label="Yang perlu diperbaiki" htmlFor="villa-reject-reason" required>
          <Textarea id="villa-reject-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: Foto kamar mandi belum ada, harga tidak sesuai foto" />
        </Field>
      </Sheet>

      {reviewApp && (
        <MitraReviewModal isOpen={!!reviewApp} onClose={() => setReviewApp(null)} mitra={reviewApp} onVerify={handleVerify} />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        tone="danger"
        title="Hapus Vila"
        message={deleteTarget ? `Hapus vila "${deleteTarget.name}"?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => { const id = deleteTarget.id; setDeleteTarget(null); handleDelete(id); }}
        onCancel={() => setDeleteTarget(null)}
      />
      <MerchantFormSheet open={isAddOpen} kind="villa" onClose={() => setIsAddOpen(false)} onSaved={() => fetchVillas()} />
    </div>
  );
};
export default VillasPage;
