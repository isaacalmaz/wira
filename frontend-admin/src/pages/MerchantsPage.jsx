import { useState, useEffect } from 'react';
import { Search, RefreshCw, FileSearch, Trash2, Plus, Store, Home, Utensils, Star, Clock } from 'lucide-react';
import { supabase } from '../config/supabase';
import { fetchPendingApplications, setApplicationStatus } from '../services/mitraApplicationService';
import MitraReviewModal from '../components/common/MitraReviewModal';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, EmptyState, IconTile, Input, PageHeader, Segmented, Stat, Table } from '../components/ui';

const isVillaType = m => m.service_type === 'villa' || m.service_type === 'WiraVilla';

const MerchantsPage = () => {
  const [liveMerchants, setLiveMerchants] = useState([]);
  const [pendingMerchants, setPendingMerchants] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'pending'
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: merchantsData, error: merchantsErr } = await supabase
        .from('merchants')
        .select('*')
        .in('service_type', ['food', 'villa', 'WiraFood', 'WiraVilla'])
        .order('created_at', { ascending: false });
      
      if (merchantsErr) throw merchantsErr;
      setLiveMerchants(merchantsData || []);

      const pendingApplications = await fetchPendingApplications(['merchant', 'villa']);
      // RegisterPage.jsx's step-1 Villa radio writes the pending
      // registration's role as the literal 'villa' (not 'merchant') now
      // that Villa is its own top-level choice - without matching both
      // values here, a brand-new Villa registration never appears in any
      // admin queue at all and can never be approved.
      const p = pendingApplications
        .map(m => ({
          id: m.id,
          auth_id: m.auth_id,
          role: 'merchant',
          name: m.restaurant_name || m.name,
          owner: m.name,
          phone: m.phone,
          email: m.email,
          address: m.address || 'Mataram, Lombok',
          service_type: m.service_type || 'food',
          sim_photo: m.sim_photo,
          ktp_photo: m.ktp_photo,
          selfie_photo: m.selfie_photo,
          vehicle_plate: m.vehicle_plate,
          vehicle_type: m.vehicle_type,
          status: m.status,
          date: m.created_at
        }));
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
      if (accept) {
        const pending = pendingMerchants.find(m => m.id === id);
        if (pending) {
          // public.users must exist BEFORE merchants (merchants.owner_id has
          // a foreign key to users.id) - this used to insert merchants first,
          // which threw a foreign-key violation for every brand-new
          // registrant (no existing users row yet, the normal case for a
          // first-time mitra signup). Because feature_flags status was
          // updated to 'Active' separately with no rollback on failure, the
          // registration looked "approved" in the queue while no merchants
          // row and no mitra_access grant ever actually happened.
          if (pending.auth_id) {
            const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
            if (profileErr) throw profileErr;

            // Villa is now its own login portal, separate from merchant
            // (Restoran) - grant the matching mitra_access value so the
            // account actually lands in the right portal.
            const isVilla = pending.service_type === 'villa' || pending.service_type === 'WiraVilla';
            const grantRole = isVilla ? 'villa' : 'merchant';
            let currentAccess = userProfile?.mitra_access || [];
            if (!currentAccess.includes(grantRole)) currentAccess.push(grantRole);

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

          const { error: insertMerchantErr } = await supabase.from('merchants').insert([{
            owner_id: pending.auth_id || null,
            name: pending.name,
            service_type: pending.service_type || 'food',
            address: pending.address,
            image: 'https://via.placeholder.com/150',
          }]);
          if (insertMerchantErr) throw insertMerchantErr;

          toast.success(`${pending.name} berhasil disetujui dan ditambahkan ke Live Database!`);
        }
      } else {
        toast.success('Pendaftaran ditolak.');
      }

      // Only mark the registration handled (Active/Rejected) after the
      // writes above actually succeeded - if they threw, the registration
      // stays 'Pending' so it's still visible to retry, instead of looking
      // silently "done" with nothing actually granted.
      await setApplicationStatus(id, accept, notes);

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
        subtitle="Kelola WiraFood & WiraVilla dan persetujuan pendaftaran merchant baru."
        actions={(
          <Button variant="secondary" onClick={fetchData} aria-label="Muat ulang" className="px-3">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Merchant Aktif" value={liveMerchants.length} icon={<Store size={18} />} />
        <Stat label="WiraVilla" value={liveMerchants.filter(isVillaType).length} icon={<Home size={18} />} tone="neutral" />
        <Stat label="Menunggu Verifikasi" value={pendingMerchants.length} icon={<Clock size={18} />} tone="neutral" />
      </div>

      {/* Tabs */}
      <Segmented
        ariaLabel="Daftar merchant"
        className="self-start"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'live', label: <>Merchant Aktif <span className="font-mono">({liveMerchants.length})</span></> },
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
            <Button leftIcon={<Plus size={18} />} onClick={() => toast('Fitur tambah manual dalam pengembangan')}>
              Tambah
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Jenis</th>
                <th>Alamat</th>
                <th className="text-right">Rating</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredLive.map(m => {
                const isVilla = m.service_type === 'villa' || m.service_type === 'WiraVilla';
                return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-semibold">{m.name}</td>
                  <td>
                    <Badge tone="neutral">
                      {isVilla ? <Home size={12} aria-hidden="true" /> : <Utensils size={12} aria-hidden="true" />}
                      {isVilla ? 'WiraVilla' : 'WiraFood'}
                    </Badge>
                  </td>
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
            const isVilla = merchant.service_type === 'villa' || merchant.service_type === 'WiraVilla';
            return (
            <Card key={merchant.id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <IconTile tone="neutral" size="sm">{isVilla ? <Home size={17} /> : <Store size={17} />}</IconTile>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="truncate text-[14px] font-semibold text-ink">{merchant.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{isVilla ? 'WiraVilla' : 'WiraFood'}</Badge>
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
    </div>
  );
};
export default MerchantsPage;
