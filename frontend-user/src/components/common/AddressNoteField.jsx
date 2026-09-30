import { useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Button, Field, Input, Sheet, cx } from '../ui';

/**
 * "Address details / landmark" input for a booking address, with a button
 * that saves the address (plus the note) to the customer's saved addresses
 * (public.saved_addresses, note column from migrations/0086).
 */
export default function AddressNoteField({ id, address, lat, lng, note, onNoteChange, className = '' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const presets = [t('address_note.preset_home'), t('address_note.preset_office'), t('address_note.preset_kos')];

  const openSave = () => {
    if (!(address || '').trim()) {
      toast.error(t('address_note.need_address'));
      return;
    }
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('saved_addresses')
        .insert({
          user_id: user.id,
          label: name.trim(),
          address: address.trim(),
          lat: lat ?? null,
          lng: lng ?? null,
          note: (note || '').trim() || null,
        })
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Blocked by RLS');
      toast.success(t('addresses.saved'));
      setOpen(false);
      setName('');
    } catch (err) {
      console.error('Error saving address:', err);
      toast.error(t('addresses.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">{t('address_note.label')}</label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t('address_note.placeholder')}
          maxLength={140}
          className="min-w-0 flex-1"
        />
        {user && (
          <Button
            variant="secondary"
            onClick={openSave}
            aria-label={t('address_note.save')}
            title={t('address_note.save')}
            className="shrink-0 !px-3"
          >
            <BookmarkPlus size={18} />
          </Button>
        )}
      </div>
      <p className="text-xs text-ink-muted">{t('address_note.hint')}</p>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!saving}
        icon={<BookmarkPlus size={22} />}
        title={t('address_note.save_title')}
        description={t('address_note.save_desc')}
        closeLabel={t('common.close')}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={saving}>{t('common.cancel')}</Button>
            <Button size="lg" onClick={save} isLoading={saving} disabled={!name.trim()}>{t('common.save')}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-control border border-line bg-card px-3.5 py-3 text-[13px] leading-relaxed">
            <p className="text-ink">{address}</p>
            {(note || '').trim() && <p className="mt-1 text-ink-muted">{t('address_note.landmark')}: {note.trim()}</p>}
          </div>
          <Field label={t('address_note.name_label')} htmlFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('address_note.name_placeholder')}
              maxLength={40}
              data-autofocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={cx(
                  'min-h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                  name === p ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-line-strong',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
