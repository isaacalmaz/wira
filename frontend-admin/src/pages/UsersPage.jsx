import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Search, Ban, CheckCircle, Car, Store, Wrench, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import ReasonSheet from '../components/common/ReasonSheet';
import { setUserBlocked, setPartnerAccess } from '../services/partnerAdminService';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CORE_ADMIN_ROLES, FINANCE_ADMIN_ROLES } from '../config/roles';
import { Badge, Button, Card, Field, Input, Money, PageHeader, Sheet, Spinner, Table, cx } from '../components/ui';

// 'courier' is no longer a separate mitra_access role - Driver now covers
// Ride/Kurir/Makanan together via self-service preferences (migrations/0033).
const MITRA_ROLES = [
  { key: 'driver', label: 'Driver', icon: Car },
  { key: 'merchant', label: 'Merchant', icon: Store },
  { key: 'technician', label: 'Teknisi', icon: Wrench },
];

const UsersPage = () => {
  // What this role may do here (enforced again in the database, 0102):
  // finance roles correct balances, core admins suspend and change access.
  const { user: me } = useAuth();
  const canCorrect = FINANCE_ADMIN_ROLES.includes(me?.role);
  const canModerate = CORE_ADMIN_ROLES.includes(me?.role);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionDesc, setCorrectionDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCorrectionConfirmOpen, setIsCorrectionConfirmOpen] = useState(false);

  const [customerRatings, setCustomerRatings] = useState({});

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setUsers(data);
      // Partners' private ratings of customers (migrations/0091), core
      // admins only; empty for other roles.
      const { data: cr } = await supabase.from('customer_ratings').select('customer_id, rating, note, created_at').order('created_at', { ascending: false });
      const byCustomer = {};
      (cr || []).forEach((r) => {
        const e = byCustomer[r.customer_id] || (byCustomer[r.customer_id] = { sum: 0, count: 0, notes: [] });
        e.sum += r.rating;
        e.count += 1;
        if (r.note && e.notes.length < 3) e.notes.push(r.note);
      });
      setCustomerRatings(byCustomer);
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengambil data pengguna');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // Step 1: validate the form and, if valid, open a confirmation step
  // instead of firing the RPC directly - a typo in the amount used to post
  // straight to a real user's real wallet_balance with no preview and no
  // way to back out.
  const handleBalanceCorrection = (e) => {
    e.preventDefault();
    if (!correctionModal) return;
    const amt = Number(correctionAmount);
    if (!amt || isNaN(amt)) {
      toast.error('Nominal tidak valid');
      return;
    }
    if (!correctionDesc.trim()) {
      toast.error('Catatan wajib diisi');
      return;
    }

    setIsCorrectionConfirmOpen(true);
  };

  // Step 2: only reached after the operator explicitly confirms in the
  // ConfirmModal below - this is what actually fires the RPC.
  const confirmBalanceCorrection = async () => {
    if (!correctionModal) return;
    const amt = Number(correctionAmount);

    setIsSubmitting(true);
    try {
      // Balance update + ledger entry both happen inside this one RPC call
      // (migrations/0062) - a single DB transaction, so a correction can
      // never leave the wallet changed with no matching transactions row.
      const { error: creditErr } = await supabase.rpc('admin_correction_wallet_balance', {
        p_user_id: correctionModal.id,
        p_amount: amt,
        p_description: correctionDesc,
      });
      if (creditErr) throw creditErr;

      toast.success('Koreksi saldo berhasil diterapkan');
      setIsCorrectionConfirmOpen(false);
      setCorrectionModal(null);
      setCorrectionAmount('');
      setCorrectionDesc('');
      fetchUsers(); // refresh data to show new balance
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal melakukan koreksi saldo');
    } finally {
      setIsSubmitting(false);
    }
  };


  // { kind: 'status', user, isActive } | { kind: 'access', user, roleKey, label, active }
  const [pendingAction, setPendingAction] = useState(null);

  // Both go through 0101's RPCs: reason required, the user is notified and
  // the decision lands in the audit log (shown on the partner profile).
  const toggleStatus = async (id, currentStatus, reason) => {
    const next = await setUserBlocked(id, currentStatus === 'Aktif', reason);
    toast.success(next === 'Diblokir' ? 'Akun ditangguhkan' : 'Akun aktif kembali');
    fetchUsers();
  };

  const toggleMitraAccess = async (user, roleKey, reason) => {
    const current = Array.isArray(user.mitra_access) ? user.mitra_access : [];
    const hasRole = current.includes(roleKey);
    const nextAccess = await setPartnerAccess(user.id, roleKey, !hasRole, reason);
    toast.success(hasRole ? `Akses ${roleKey} dicabut dari ${user.name}` : `Akses ${roleKey} diberikan ke ${user.name}`);
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, mitra_access: nextAccess } : u));
  };

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Manajemen Pengguna"
        subtitle="Semua pengguna Wira, termasuk pengelolaan akses mitra (driver/merchant/teknisi)"
        className="!mb-0"
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            type="text"
            aria-label="Cari pengguna"
            placeholder="Cari nama/email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 !text-sm"
          />
        </div>
        {!loading && (
          <p className="text-[13px] text-ink-muted md:ml-auto">
            <span className="font-mono font-medium text-ink">{filtered.length.toLocaleString('id-ID')}</span> pengguna
          </p>
        )}
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-3 py-16 text-[13.5px] text-ink-muted">
          <Spinner size={18} className="text-brand" /> Memuat...
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Telepon</th>
              <th className="text-right">Saldo</th>
              <th>Status</th>
              <th>Akses Mitra</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const access = Array.isArray(u.mitra_access) ? u.mitra_access : [];
              const isActive = (u.status || 'Aktif') === 'Aktif';
              return (
              <tr key={u.id}>
                <td className="whitespace-nowrap font-semibold">
                  <div className="flex flex-col items-start gap-1">
                    {Array.isArray(u.mitra_access) && u.mitra_access.length > 0
                      ? <Link to={`/partners/${u.id}`} className="hover:underline">{u.name}</Link>
                      : u.name}
                    {customerRatings[u.id] && (() => {
                      const r = customerRatings[u.id];
                      const avg = r.sum / r.count;
                      return (
                        <span title={r.notes.length ? `Catatan mitra: ${r.notes.join(' · ')}` : 'Penilaian dari mitra (tidak dilihat pelanggan)'}>
                          <Badge tone={avg < 3 ? 'danger' : avg < 4 ? 'warning' : 'neutral'}>
                            Dinilai mitra {avg.toFixed(1)} ({r.count})
                          </Badge>
                        </span>
                      );
                    })()}
                  </div>
                </td>
                <td className="text-ink-muted">{u.email}</td>
                <td className="whitespace-nowrap font-mono text-[12.5px]">{u.phone}</td>
                <td className="text-right"><Money value={u.wallet_balance || 0} /></td>
                <td>
                  <Badge tone={isActive ? 'success' : 'danger'} dot>{u.status || 'Aktif'}</Badge>
                </td>
                <td>
                  <div className="flex gap-1.5">
                    {MITRA_ROLES.map(({ key, label, icon: Icon }) => {
                      const active = access.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => canModerate && setPendingAction({ kind: 'access', user: u, roleKey: key, label, active })}
                          disabled={!canModerate}
                          title={active ? `Cabut akses ${label}` : `Berikan akses ${label}`}
                          aria-pressed={active}
                          className={cx(
                            'inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors',
                            active
                              ? 'border-brand-line bg-brand-soft text-brand-ink'
                              : 'border-line bg-card text-ink-muted hover:border-line-strong hover:text-ink',
                          )}
                        >
                          <Icon size={13} /> {label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canCorrect && <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCorrectionModal(u)}
                      title="Koreksi Saldo"
                      leftIcon={<Wallet size={15} />}
                      className="whitespace-nowrap"
                    >
                      Koreksi Saldo
                    </Button>}
                    {canModerate && <Button
                      size="sm"
                      variant={isActive ? 'danger-soft' : 'secondary'}
                      onClick={() => setPendingAction({ kind: 'status', user: u, isActive })}
                      title={isActive ? 'Tangguhkan' : 'Aktifkan'}
                      leftIcon={isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                      className="whitespace-nowrap"
                    >
                      {isActive ? 'Tangguhkan' : 'Aktifkan'}
                    </Button>}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* Modal Koreksi Saldo - hidden (not closed) while the confirmation
          step below is showing, so only one sheet is ever on screen. */}
      <Sheet
        open={!!correctionModal && !isCorrectionConfirmOpen}
        onClose={() => setCorrectionModal(null)}
        title="Koreksi Saldo Manual"
        icon={<Wallet size={20} />}
        tone="pay"
        description={correctionModal ? (
          <>
            Atas nama: <span className="font-semibold text-ink">{correctionModal.name}</span>
            {' · '}Saldo saat ini <Money value={correctionModal.wallet_balance || 0} className="text-ink" />
          </>
        ) : null}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCorrectionModal(null)}>
              Batal
            </Button>
            <Button type="submit" form="balance-correction-form" disabled={isSubmitting}>
              {isSubmitting ? 'Memproses...' : 'Lanjutkan'}
            </Button>
          </>
        )}
      >
        <form id="balance-correction-form" onSubmit={handleBalanceCorrection} className="flex flex-col gap-4">
          <Field label="Nominal Koreksi (Rp)" htmlFor="correction-amount" hint="Gunakan tanda minus (-) untuk menarik saldo.">
            <Input
              id="correction-amount"
              type="number"
              placeholder="Misal: 10584 (tambah) atau -10584 (kurangi)"
              className="font-mono"
              value={correctionAmount}
              onChange={e => setCorrectionAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Catatan / Alasan" htmlFor="correction-desc">
            <Input
              id="correction-desc"
              type="text"
              placeholder="Misal: Salah transfer QRIS, Refund manual"
              value={correctionDesc}
              onChange={e => setCorrectionDesc(e.target.value)}
              required
            />
          </Field>
        </form>
      </Sheet>

      {/* Blokir / aktifkan akun dan ubah akses mitra: selalu lewat konfirmasi */}
      <ReasonSheet
        open={!!pendingAction}
        tone={pendingAction && ((pendingAction.kind === 'status' && pendingAction.isActive) || (pendingAction.kind === 'access' && pendingAction.active)) ? 'danger' : 'default'}
        title={!pendingAction ? '' : pendingAction.kind === 'status'
          ? (pendingAction.isActive ? `Tangguhkan ${pendingAction.user.name}?` : `Aktifkan ${pendingAction.user.name}?`)
          : (pendingAction.active ? `Cabut akses ${pendingAction.label}?` : `Berikan akses ${pendingAction.label}?`)}
        description={!pendingAction ? '' : pendingAction.kind === 'status'
          ? (pendingAction.isActive
            ? 'Akun ini tidak bisa memakai Wira sampai diaktifkan lagi.'
            : 'Akun ini bisa memakai Wira lagi.')
          : (pendingAction.active
            ? `${pendingAction.user.name} tidak bisa masuk ke portal ${pendingAction.label} di Wira Mitra.`
            : `${pendingAction.user.name} bisa masuk ke portal ${pendingAction.label} di Wira Mitra.`)}
        confirmLabel={!pendingAction ? 'Konfirmasi' : pendingAction.kind === 'status'
          ? (pendingAction.isActive ? 'Tangguhkan' : 'Aktifkan')
          : (pendingAction.active ? 'Cabut akses' : 'Berikan akses')}
        onConfirm={async (reason) => {
          const a = pendingAction;
          try {
            if (a.kind === 'status') await toggleStatus(a.user.id, a.user.status || 'Aktif', reason);
            else await toggleMitraAccess(a.user, a.roleKey, reason);
            setPendingAction(null);
          } catch (err) {
            toast.error(err.message || 'Gagal menyimpan');
          }
        }}
        onClose={() => setPendingAction(null)}
      />

      {/* Konfirmasi Koreksi Saldo - ringkasan saldo lama -> baru sebelum RPC
          benar-benar dijalankan, agar salah ketik nominal tidak langsung
          mengubah saldo asli pengguna tanpa jeda konfirmasi. */}
      <ConfirmModal
        isOpen={isCorrectionConfirmOpen}
        title="Konfirmasi Koreksi Saldo"
        message={correctionModal ? (() => {
          const amt = Number(correctionAmount) || 0;
          const current = Number(correctionModal.wallet_balance) || 0;
          const next = current + amt;
          const direction = amt >= 0 ? 'Menambah' : 'Mengurangi';
          return `${direction} saldo ${correctionModal.name} sebesar Rp ${Math.abs(amt).toLocaleString('id-ID')}. ` +
            `Saldo saat ini: Rp ${current.toLocaleString('id-ID')} -> Saldo baru: Rp ${next.toLocaleString('id-ID')}. ` +
            `Catatan: "${correctionDesc}". Tindakan ini langsung berlaku pada saldo asli pengguna.`;
        })() : ''}
        onConfirm={confirmBalanceCorrection}
        onCancel={() => setIsCorrectionConfirmOpen(false)}
      />
    </div>
  );
};
export default UsersPage;
