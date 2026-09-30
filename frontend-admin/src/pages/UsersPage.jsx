import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Search, Ban, CheckCircle, Car, Store, Wrench, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ConfirmModal } from '../components/common/UIComponents';
import { Badge, Button, Card, Field, Input, Money, PageHeader, Sheet, Spinner, Table, cx } from '../components/ui';

// 'courier' is no longer a separate mitra_access role - Driver now covers
// Ride/Kurir/Makanan together via self-service preferences (migrations/0033).
const MITRA_ROLES = [
  { key: 'driver', label: 'Driver', icon: Car },
  { key: 'merchant', label: 'Merchant', icon: Store },
  { key: 'technician', label: 'Teknisi', icon: Wrench },
];

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionDesc, setCorrectionDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCorrectionConfirmOpen, setIsCorrectionConfirmOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setUsers(data);
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


  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Aktif' ? 'Diblokir' : 'Aktif';
    try {
      const { error, data } = await supabase.from('users').update({ status: newStatus }).eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak atau data tidak ditemukan.");
      toast.success(`Status diubah menjadi ${newStatus}`);
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah status');
    }
  };

  const toggleMitraAccess = async (user, roleKey) => {
    const current = Array.isArray(user.mitra_access) ? user.mitra_access : [];
    const hasRole = current.includes(roleKey);
    const nextAccess = hasRole ? current.filter(r => r !== roleKey) : [...current, roleKey];

    try {
      const { error, data } = await supabase
        .from('users')
        .update({ mitra_access: nextAccess })
        .eq('id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Akses ditolak oleh RLS atau pengguna tidak ditemukan.");
      toast.success(hasRole ? `Akses ${roleKey} dicabut dari ${user.name}` : `Akses ${roleKey} diberikan ke ${user.name}`);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, mitra_access: nextAccess } : u));
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal mengubah akses mitra');
    }
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
                <td className="whitespace-nowrap font-semibold">{u.name}</td>
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
                          onClick={() => toggleMitraAccess(u, key)}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCorrectionModal(u)}
                      title="Koreksi Saldo"
                      leftIcon={<Wallet size={15} />}
                      className="whitespace-nowrap"
                    >
                      Koreksi Saldo
                    </Button>
                    <Button
                      size="sm"
                      variant={isActive ? 'danger-soft' : 'secondary'}
                      onClick={() => toggleStatus(u.id, u.status || 'Aktif')}
                      title={isActive ? 'Blokir' : 'Aktifkan'}
                      leftIcon={isActive ? <Ban size={15} /> : <CheckCircle size={15} />}
                      className="whitespace-nowrap"
                    >
                      {isActive ? 'Blokir' : 'Aktifkan'}
                    </Button>
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
