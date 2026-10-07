import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Button, Field, Input, Sheet } from '../ui';

/**
 * Permanent account deletion (delete_my_account, migrations/0106). The
 * server refuses while an order, balance or commission is still open and
 * says why; that message is shown as is.
 */
export default function DeleteAccountSheet({ open, onClose }) {
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = confirm.trim().toUpperCase() === 'HAPUS';

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirm });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Akun Anda sudah dihapus.');
    onClose?.();
    await logout();
  };

  return (
    <Sheet
      open={open}
      onClose={() => { setConfirm(''); onClose?.(); }}
      tone="danger"
      icon={<Trash2 size={20} />}
      title={'Hapus akun'}
      description={'Tindakan ini permanen dan tidak bisa dibatalkan.'}
      closeLabel={'Tutup'}
      footer={
        <Button variant="danger" block isLoading={busy} disabled={!ready || busy} onClick={submit}>
          {'Hapus akun saya'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>{'Nama, nomor HP, email, foto, alamat tersimpan, serta foto KTP/SIM pendaftaran mitra dihapus. Toko atau villa Anda berhenti tampil.'}</li>
          <li>{'Riwayat pesanan dan transaksi tetap disimpan tanpa nama Anda, untuk keperluan pembukuan.'}</li>
          <li>{'Akun hanya bisa dihapus jika tidak ada pesanan berjalan, saldo, pendapatan, atau komisi yang belum diselesaikan.'}</li>
        </ul>
        <Field label={'Ketik HAPUS untuk mengonfirmasi'} htmlFor="delete-confirm">
          <Input id="delete-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="HAPUS" />
        </Field>
      </div>
    </Sheet>
  );
}
