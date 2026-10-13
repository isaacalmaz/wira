import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Search, Ban, CheckCircle, Trash2, Users, Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CORE_ADMIN_ROLES } from '../config/roles';
import { fetchCustomerList } from '../services/peopleAdminService';
import { setUserBlocked } from '../services/partnerAdminService';
import ReasonSheet from '../components/common/ReasonSheet';
import DeleteAccountSheet from '../components/common/DeleteAccountSheet';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table } from '../components/ui';
import { formatDateTime } from '../utils/datetime';

/**
 * Pelanggan: accounts that only buy (no partner access, not staff;
 * admin_customer_list, migrations/0122). Partners are under Mitra; anyone
 * can be opened as a full Profil Akun.
 */
export default function CustomersPage() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const canModerate = CORE_ADMIN_ROLES.includes(me?.role);
  const canDelete = ['Superadmin', 'superadmin'].includes(me?.role);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [blockTarget, setBlockTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    fetchCustomerList().then(setRows).catch((err) => { toast.error(`Gagal memuat pelanggan: ${err.message}`); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((c) => !needle
    || (c.name || '').toLowerCase().includes(needle)
    || (c.email || '').toLowerCase().includes(needle)
    || (c.phone || '').replace(/\D/g, '').includes(needle.replace(/\D/g, '') || '§'));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title="Pelanggan" subtitle="Akun pembeli. Mitra ada di grup Mitra; klik nama untuk Profil Akun." />

      <div className="flex items-center gap-2 rounded-control border border-line-strong bg-card px-3">
        <Search size={16} className="text-ink-muted" aria-hidden="true" />
        <input
          id="customer-search"
          aria-label="Cari pelanggan"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, email, atau nomor HP"
          className="min-h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {rows === null ? (
        <Card className="flex min-h-[140px] items-center justify-center"><Spinner /></Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title={rows.length ? 'Tidak ada pelanggan yang cocok' : 'Belum ada pelanggan'} />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Pelanggan</th>
                <th>Pesanan</th>
                <th>Pesanan terakhir</th>
                <th>Dinilai mitra</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const active = c.status === 'Aktif';
                return (
                  <tr key={c.id} className="cursor-pointer hover:bg-sunken" onClick={() => navigate(`/accounts/${c.id}`)}>
                    <td>
                      <div className="flex flex-col">
                        <Link to={`/accounts/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink hover:underline">{c.name || 'Tanpa nama'}</Link>
                        <span className="text-[12px] text-ink-muted">{[c.phone, c.email].filter(Boolean).join(' · ') || '–'}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-ink-muted">
                      <span className="font-mono text-ink">{c.orders}</span> · {c.completed} selesai{c.cancelled > 0 ? ` · ${c.cancelled} batal` : ''}
                    </td>
                    <td className="whitespace-nowrap text-[13px] text-ink-muted">{c.last_order_at ? formatDateTime(c.last_order_at) : '–'}</td>
                    <td className="text-[13px]">
                      {c.rating_count > 0
                        ? <span className="inline-flex items-center gap-1 font-mono"><Star size={12} className="fill-current text-pay" aria-hidden="true" />{Number(c.rating_avg).toFixed(1)} <span className="text-ink-muted">({c.rating_count})</span></span>
                        : <span className="text-ink-muted">–</span>}
                    </td>
                    <td><Badge tone={active ? 'success' : c.status === 'Dihapus' ? 'neutral' : 'danger'} dot>{c.status === 'Diblokir' ? 'Ditangguhkan' : c.status}</Badge></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {canModerate && c.status !== 'Dihapus' && (
                          <Button size="sm" variant={active ? 'danger-soft' : 'secondary'} leftIcon={active ? <Ban size={15} /> : <CheckCircle size={15} />}
                            onClick={() => setBlockTarget(c)}>
                            {active ? 'Tangguhkan' : 'Aktifkan'}
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="sm" variant="ghost" className="text-danger-ink" leftIcon={<Trash2 size={15} />} onClick={() => setDeleting(c)} aria-label={`Hapus akun ${c.name || ''}`}>Hapus</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <ReasonSheet
        open={!!blockTarget}
        tone={blockTarget?.status === 'Aktif' ? 'danger' : 'default'}
        title={!blockTarget ? '' : blockTarget.status === 'Aktif' ? `Tangguhkan ${blockTarget.name}?` : `Aktifkan ${blockTarget.name}?`}
        description={blockTarget?.status === 'Aktif'
          ? 'Pelanggan tidak bisa membuat pesanan sampai diaktifkan lagi. Alasannya dikirim lewat notifikasi.'
          : 'Pelanggan bisa memesan lagi.'}
        confirmLabel={blockTarget?.status === 'Aktif' ? 'Tangguhkan' : 'Aktifkan'}
        onClose={() => setBlockTarget(null)}
        onConfirm={async (reason) => {
          try {
            const next = await setUserBlocked(blockTarget.id, blockTarget.status === 'Aktif', reason);
            toast.success(next === 'Diblokir' ? 'Akun ditangguhkan' : 'Akun aktif kembali');
            setBlockTarget(null);
            load();
          } catch (err) {
            toast.error(err.message || 'Gagal mengubah status');
          }
        }}
      />

      <DeleteAccountSheet account={deleting} open={!!deleting} onClose={() => setDeleting(null)} onDeleted={load} />
    </div>
  );
}
