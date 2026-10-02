import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button, Field, Sheet, Textarea } from '../ui';

/**
 * Confirmation that asks why. Admin decisions about partners (suspend,
 * reactivate, revoke access, deactivate a restaurant or villa) all need a
 * reason the partner receives and the audit log keeps (migrations/0101).
 */
export default function ReasonSheet({ open, title, description, confirmLabel = 'Simpan', tone = 'default', icon, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setReason(''); }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      dismissible={!busy}
      size="sm"
      tone={tone}
      icon={icon || <ShieldAlert size={22} />}
      title={title}
      description={description}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={submit} isLoading={busy} disabled={reason.trim().length < 5}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <Field label="Alasan (dikirim ke mitra dan dicatat)" htmlFor="reason-sheet-text" required hint="Minimal 5 karakter">
        <Textarea id="reason-sheet-text" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}
