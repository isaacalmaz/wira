import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Button, Field, Input, Sheet } from '../ui';
import { friendlyError } from '../../utils/friendlyError';

/**
 * Permanent account deletion (delete_my_account, migrations/0106). The
 * server refuses while an order, balance or commission is still open and
 * says why; that message is shown as is.
 */
export default function DeleteAccountSheet({ open, onClose }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = confirm.trim().toUpperCase() === 'HAPUS';

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirm });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t('delete_account.done'));
    onClose?.();
    await logout();
  };

  return (
    <Sheet
      open={open}
      onClose={() => { setConfirm(''); onClose?.(); }}
      tone="danger"
      icon={<Trash2 size={20} />}
      title={t('delete_account.title')}
      description={t('delete_account.subtitle')}
      closeLabel={t('common.close')}
      footer={
        <Button variant="danger" block isLoading={busy} disabled={!ready || busy} onClick={submit}>
          {t('delete_account.confirm_button')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>{t('delete_account.point_profile')}</li>
          <li>{t('delete_account.point_history')}</li>
          <li>{t('delete_account.point_open')}</li>
        </ul>
        <Field label={t('delete_account.type_label')} htmlFor="delete-confirm">
          <Input id="delete-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="HAPUS" />
        </Field>
      </div>
    </Sheet>
  );
}
