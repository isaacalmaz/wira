import { useState, useEffect } from 'react';
import { Search, RefreshCw, FileSearch, Trash2, Plus, Store, Star, Clock, DoorOpen } from 'lucide-react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, reviewApplication } from '../services/mitraApplicationService';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, EmptyState, IconTile, Input, PageHeader, Segmented, Stat, Table } from '../components/ui';
import MerchantFormSheet from '../components/common/MerchantFormSheet';
import { toMerchantApplication } from '../services/merchantApprovalService';

const MerchantsPage = () => {
  const [liveMerchants, setLiveMerchants] = useState([]);
  const [pendingMerchants, setPendingMerchants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'pending'
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: merchantsData, error: merchantsErr } = await supabase
        .from('merchants')
        .select('*')
        // Restaurants only; villas have their own page (VillasPage).
        .in('service_type', ['food', 'WiraFood'])
        .order('created_at', { ascending: false });
      
      if (merchantsErr) throw merchantsErr;
      setLiveMerchants(merchantsData || []);

      // Restaurant registrations only; villa registrations (role 'villa')
      // are reviewed on VillasPage.
      const pendingApplications = await fetchPendingApplications(['merchant']);
      const p = pendingApplications.map(toMerchantApplication);
      setPendingMerchants(p);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data merchant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerify = async (id, accept, notes = '') => {
    try {
      await reviewApplication(id, accept, notes);
      toast.success(accept ? 'Restoran disetujui dan siap mengisi menu.' : 'Pendaftaran ditolak; alasannya dikirim ke pendaftar.');
      setIsReviewOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Terjadi kesalahan saat memverifikasi merchant');
    }
  };

  const handleDeleteLive = async (id) => {
    // Confirmation now happens in the ConfirmModal below (deleteTarget).
    try {
      const { error, data } = await supabase.from('merchants').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success('Merchant dihapus dari Live Database');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menghapus merchant');
    }
  };

  const filteredLive = liveMerchants.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Manajemen Merchant"
        subtitle="Kelola restoran WiraFood dan persetujuan pendaftaran restoran baru. Villa ada di menu Villas."
        actions={(
          <Button variant="secondary" onClick={fetchData} aria-label="Muat ulang" className="px-3">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Restoran" value={liveMerchants.length} icon={<Store size={18} />} />
        <Stat label="Sedang Buka" value={liveMerchants.filter((m) => m.is_open !== false).length} icon={<DoorOpen size={18} />} tone="neutral" />
        <Stat label="Menunggu Verifikasi" value={pendingMerchants.length} icon={<Clock size={18} />} tone="neutral" />
      </div>

      {/* Tabs */}
      <Segmented
        ariaLabel="Daftar merchant"
        className="self-start"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'live', label: <>Restoran <span className="font-mono">({liveMerchants.length})</span></> },
          {
            value: 'pending',
            label: (
              <span className="inline-flex items-center gap-2">
                Menunggu Verifikasi
                {pendingMerchants.length > 0 && <Badge tone="warning" className="px-2 py-0 font-mono">{pendingMerchants.length}</Badge>}
              </span>
            ),
          },
        ]}
      />

      {activeTab === 'live' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} aria-hidden="true" />
              <Input type="text" aria-label="Cari nama merchant" placeholder="Cari nama merchant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Button leftIcon={<Plus size={18} />} onClick={() => setIsAddOpen(true)}>
              Tambah
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kategori</th>
                <th>Alamat</th>
                <th className="text-right">Rating</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredLive.map(m => {
                return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-semibold">{m.name}</td>
                  <td className="text-ink-muted">{m.category || '—'}</td>
                  <td className="max-w-[260px] truncate text-ink-muted" title={m.address}>{m.address}</td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Star size={13} className="fill-current text-warning" aria-hidden="true" />
                      {m.rating}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button size="sm" variant="danger-soft" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteTarget(m)}>
                      Hapus
                    </Button>
                  </td>
                </tr>
                );
              })}
              {filteredLive.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-ink-muted">
                    {loading ? 'Memuat...' : 'Tidak ada merchant.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pendingMerchants.map(merchant => {
            return (
            <Card key={merchant.id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <IconTile tone="neutral" size="sm"><Store size={17} /></IconTile>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="truncate text-[14px] font-semibold text-ink">{merchant.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">WiraFood</Badge>
                    <Badge tone="warning" dot>Menunggu Verifikasi</Badge>
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-ink-muted">Pemilik</dt>
                <dd className="min-w-0 truncate text-ink">{merchant.owner}</dd>
                <dt className="text-ink-muted">HP</dt>
                <dd className="min-w-0 truncate font-mono text-ink">{merchant.phone}</dd>
                <dt className="text-ink-muted">Lokasi</dt>
                <dd className="min-w-0 truncate text-ink" title={merchant.address}>{merchant.address}</dd>
              </dl>
              <Button
                variant="secondary"
                size="sm"
                block
                className="mt-auto"
                leftIcon={<FileSearch size={15} />}
                onClick={() => { setSelectedMerchant(merchant); setIsReviewOpen(true); }}
              >
                Review Berkas
              </Button>
            </Card>
            );
          })}
          {pendingMerchants.length === 0 && (
            <EmptyState
              className="col-span-full"
              icon={<FileSearch size={24} />}
              title="Tidak ada pendaftaran merchant baru saat ini."
            />
          )}
        </div>
      )}

      {selectedMerchant && (
        <MitraReviewModal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          mitra={selectedMerchant}
          onVerify={handleVerify}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        tone="danger"
        title="Hapus Merchant"
        message={deleteTarget ? `Hapus merchant "${deleteTarget.name}" dari aplikasi?` : ''}
        confirmLabel="Hapus"
        onConfirm={() => { const id = deleteTarget.id; setDeleteTarget(null); handleDeleteLive(id); }}
        onCancel={() => setDeleteTarget(null)}
      />
      <MerchantFormSheet open={isAddOpen} kind="food" onClose={() => setIsAddOpen(false)} onSaved={fetchData} />
    </div>
  );
};
export default MerchantsPage;
