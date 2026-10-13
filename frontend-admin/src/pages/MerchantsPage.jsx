import { useState, useEffect } from 'react';
import { Search, RefreshCw, Power, Plus, Store, Star, Clock, DoorOpen, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReasonSheet from '../components/common/ReasonSheet';
import { setMerchantActive } from '../services/partnerAdminService';
import { supabase } from '../config/supabase';
import { fetchPendingApplications } from '../services/mitraApplicationService';
import { applicationKind } from '../services/peopleAdminService';
import toast from 'react-hot-toast';
import { Badge, Button, Input, PageHeader, Stat, Table } from '../components/ui';
import MerchantFormSheet from '../components/common/MerchantFormSheet';

const MerchantsPage = () => {
  const [liveMerchants, setLiveMerchants] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: merchantsData, error: merchantsErr } = await supabase
        .from('merchants')
        .select('*, owner:owner_id(name)')
        // Restaurants only; villas have their own page (VillasPage).
        .in('service_type', ['food', 'WiraFood'])
        .order('created_at', { ascending: false });
      
      if (merchantsErr) throw merchantsErr;
      setLiveMerchants(merchantsData || []);

      // Registrations are reviewed in Pendaftaran; here only the count.
      const pendingApplications = await fetchPendingApplications(['merchant'], 'id, service_type');
      setPendingCount(pendingApplications.filter((a) => applicationKind({ role: 'merchant', ...a }) === 'merchant').length);
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

  // Restaurants are deactivated, never deleted (admin_set_merchant_active,
  // migrations/0101): hidden from customers, history kept, reversible.
  const confirmActive = async (reason) => {
    const m = deleteTarget;
    try {
      await setMerchantActive(m.id, m.listing_status === 'suspended', reason);
      toast.success(m.listing_status === 'suspended' ? `${m.name} aktif kembali` : `${m.name} dinonaktifkan`);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status');
    }
  };

  const filteredLive = liveMerchants.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="!mb-0"
        title="Restoran"
        subtitle="Restoran WiraFood yang sudah disetujui. Pendaftar baru diperiksa di Pendaftaran."
        actions={(
          <Button variant="secondary" onClick={fetchData} aria-label="Muat ulang" className="px-3">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Restoran" value={liveMerchants.length} icon={<Store size={18} />} />
        <Stat label="Aktif" value={liveMerchants.filter((m) => m.listing_status !== 'suspended').length} icon={<DoorOpen size={18} />} tone="neutral" />
        <Stat label="Menunggu di Pendaftaran" value={pendingCount} icon={<Clock size={18} />} tone="neutral" />
      </div>

      {pendingCount > 0 && (
        <Link to="/applications" className="flex items-center gap-3 rounded-card border border-warning-line bg-warning-soft px-4 py-3 text-[13.5px] font-semibold text-warning-ink">
          <Inbox size={18} aria-hidden="true" /> {pendingCount} pendaftar Restoran menunggu di Pendaftaran
        </Link>
      )}

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
                <th>Pemilik</th>
                <th>Alamat</th>
                <th className="text-right">Rating</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredLive.map(m => {
                return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-semibold">
                    {m.name}
                    {m.listing_status === 'suspended' && <Badge tone="danger" dot className="ml-2">Dinonaktifkan</Badge>}
                    {m.category && <span className="block text-[12px] font-normal text-ink-muted">{m.category}</span>}
                  </td>
                  <td className="whitespace-nowrap">{m.owner_id ? <Link to={`/accounts/${m.owner_id}`} className="hover:underline">{m.owner?.name || 'Pemilik'}</Link> : <span className="text-ink-muted">—</span>}</td>
                  <td className="max-w-[260px] truncate text-ink-muted" title={m.address}>{m.address}</td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Star size={13} className="fill-current text-warning" aria-hidden="true" />
                      {m.rating}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button size="sm" variant={m.listing_status === 'suspended' ? 'secondary' : 'danger-soft'} leftIcon={<Power size={15} />} onClick={() => setDeleteTarget(m)}>
                      {m.listing_status === 'suspended' ? 'Aktifkan' : 'Nonaktifkan'}
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

      <ReasonSheet
        open={!!deleteTarget}
        tone={deleteTarget?.listing_status === 'suspended' ? 'default' : 'danger'}
        title={deleteTarget ? (deleteTarget.listing_status === 'suspended' ? `Aktifkan lagi ${deleteTarget.name}?` : `Nonaktifkan ${deleteTarget.name}?`) : ''}
        description={deleteTarget?.listing_status === 'suspended'
          ? 'Tampil lagi untuk pelanggan dan bisa menerima pesanan.'
          : 'Tidak tampil untuk pelanggan dan tidak bisa dipesan. Menu dan riwayat pesanan tetap tersimpan; bisa diaktifkan lagi kapan saja.'}
        confirmLabel={deleteTarget?.listing_status === 'suspended' ? 'Aktifkan' : 'Nonaktifkan'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmActive}
      />
      <MerchantFormSheet open={isAddOpen} kind="food" onClose={() => setIsAddOpen(false)} onSaved={fetchData} />
    </div>
  );
};
export default MerchantsPage;
