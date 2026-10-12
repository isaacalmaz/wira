import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Field, Input, Money, Notice, Segmented, Sheet, Spinner, Textarea } from '../ui';

const MODES = [
  { value: 'anonymise', label: 'Hapus Akun' },
  { value: 'permanent', label: 'Hapus Permanen' },
];

const MODE_TEXT = {
  anonymise: {
    rpc: 'admin_delete_account',
    lead: 'Data pribadi, foto KTP, alamat, dan login dihapus. Riwayat pesanan dan pembayaran tetap tersimpan tanpa nama. Restoran/villa disembunyikan. Email yang sama bisa mendaftar lagi sebagai akun baru.',
    use: 'Untuk pelanggan atau mitra sungguhan yang berhenti.',
    done: 'Akun dihapus (riwayat tetap tersimpan)',
  },
  permanent: {
    rpc: 'admin_delete_account_permanently',
    lead: 'Akun, login, pesanannya sebagai pelanggan, restoran/villa dan menunya, chat, ulasan, rating, proyek, dan data pendaftaran (termasuk foto KTP) dihapus. Pesanan orang lain yang pernah ia antar tetap ada tanpa nama driver.',
    use: 'Untuk akun dummy dan uji coba. Pesanan selesai miliknya ikut hilang dari laporan.',
    done: 'Akun dihapus permanen',
  },
};

/**
 * Superadmin-only account deletion (migrations/0121): choose "Hapus Akun"
 * (anonymise, keep bookkeeping) or "Hapus Permanen" (remove everything),
 * see what is affected, retype the confirmation text and give a reason.
 * Already anonymised accounts can only be removed permanently.
 */
export default function DeleteAccountSheet({ account, open, onClose, onDeleted }) {
  const [footprint, setFootprint] = useState(null);
  const [mode, setMode] = useState('anonymise');
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !account) return;
    setFootprint(null);
    setConfirmText('');
    setReason('');
    supabase.rpc('admin_account_footprint', { p_user_id: account.id }).then(({ data, error }) => {
      if (error) { toast.error(error.message); onClose?.(); return; }
      setFootprint(data);
      setMode(data?.status === 'Dihapus' ? 'permanent' : 'anonymise');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  const alreadyDeleted = footprint?.status === 'Dihapus';
  const t = MODE_TEXT[mode];
  const matches = footprint && confirmText.trim().toLowerCase() === String(footprint.confirm_text).toLowerCase();
  const blockedBy = footprint && (footprint.running_orders > 0 ? 'Masih ada pesanan berjalan. Selesaikan atau batalkan dulu dari menu Pesanan.'
    : footprint.running_projects > 0 ? 'Masih ada proyek berjalan. Selesaikan atau batalkan dulu dari menu Proyek.' : null);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc(t.rpc, { p_user_id: account.id, p_confirm: confirmText.trim(), p_reason: reason.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.done);
    onDeleted?.(mode);
    onClose?.();
  };

  const rows = footprint ? [
    ['Pesanan sebagai pelanggan', footprint.orders_as_customer],
    ['Pesanan sebagai mitra', footprint.orders_as_partner],
    ['Restoran / villa', footprint.places],
    ['Pesanan di restoran / villa itu', footprint.place_orders],
  ] : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tone="danger"
      icon={<Trash2 size={20} />}
      title={`Hapus akun ${account?.name || ''}`}
      description="Tidak bisa dibatalkan. Khusus Superadmin."
      footer={(
        <Button variant="danger" size="lg" block isLoading={busy}
          disabled={!footprint || !!blockedBy || !matches || reason.trim().length < 5 || busy}
          onClick={submit}>
          {mode === 'permanent' ? 'Hapus Permanen' : 'Hapus Akun'}
        </Button>
      )}
    >
      {!footprint ? (
        <div className="flex min-h-[140px] items-center justify-center"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-4 text-[13.5px] leading-relaxed text-ink">
          {alreadyDeleted ? (
            <Notice tone="info">Akun ini sudah dihapus (data pribadinya sudah hilang). Yang tersisa hanya bisa dihapus permanen.</Notice>
          ) : (
            <Segmented ariaLabel="Cara menghapus" options={MODES} value={mode} onChange={setMode} />
          )}
          <div className="flex flex-col gap-1">
            <p>{t.lead}</p>
            <p className="text-ink-muted">{t.use}</p>
          </div>

          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-control bg-sunken px-3.5 py-3">
            {rows.map(([label, n]) => (
              <div key={label} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-mono">{n}</dd>
              </div>
            ))}
            {Number(footprint.payable_balance) !== 0 && (
              <div className="contents">
                <dt className="text-ink-muted">{Number(footprint.payable_balance) < 0 ? 'Komisi belum disetor' : 'Saldo mitra'}</dt>
                <dd className="text-right"><Money value={Math.abs(Number(footprint.payable_balance))} className="font-medium" /></dd>
              </div>
            )}
          </dl>

          {blockedBy ? (
            <Notice tone="danger">{blockedBy}</Notice>
          ) : (
            <>
              {Number(footprint.payable_balance) < 0 && (
                <Notice tone="warning">Komisi yang belum disetor ikut hilang. Tagih dulu kalau masih perlu.</Notice>
              )}
              <Field label={<>Ketik <span className="font-mono font-semibold">{footprint.confirm_text}</span> untuk mengonfirmasi</>} htmlFor="delete-confirm-text">
                <Input id="delete-confirm-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="font-mono" />
              </Field>
              <Field label="Alasan (dicatat di Log Aktivitas)" htmlFor="delete-reason">
                <Textarea id="delete-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: akun uji coba" />
              </Field>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
