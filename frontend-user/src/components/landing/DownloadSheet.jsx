import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, Apple, Globe } from 'lucide-react';
import { Sheet, Button, Field, Input, Badge, Notice } from '../ui';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';

// "Unduh aplikasi" on the landing page. The Android apps are in Google Play
// closed testing, so Android visitors leave their Gmail (request_tester_access,
// migrations/0118) and an admin adds it to the tester list. The App Store
// version is not ready yet; the web app works for everyone today.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function DownloadSheet({ open, onClose }) {
  const { t: tr } = useTranslation();
  const t = (k) => tr(`landing.dl_${k}`);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t('email_invalid'));
      return;
    }
    setError('');
    setSending(true);
    const { error: rpcError } = await supabase.rpc('request_tester_access', { p_email: value, p_apps: 'both' });
    setSending(false);
    if (rpcError) {
      setError(/tidak valid/i.test(rpcError.message) ? t('email_invalid') : t('send_failed'));
      return;
    }
    setDone(true);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('title')} description={t('subtitle')} size="md" closeLabel={tr('common.close')}>
      <div className="flex flex-col gap-3.5">
        {/* Android: closed testing sign-up */}
        <section className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-ink"><Smartphone size={20} /></span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-ink">Android</h3>
                <Badge tone="warning">{t('android_badge')}</Badge>
              </div>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">{t('android_desc')}</p>
            </div>
          </div>
          {done ? (
            <Notice tone="success" title={t('done_title')}>{t('done')}</Notice>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2.5" noValidate>
              <Field label={t('email_label')} htmlFor="tester-email" error={error || undefined} hint={!error ? t('email_hint') : undefined}>
                <Input
                  id="tester-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="nama@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  invalid={!!error}
                />
              </Field>
              <Button type="submit" isLoading={sending} disabled={sending} block>{t('submit')}</Button>
            </form>
          )}
        </section>

        {/* iPhone: not yet */}
        <section className="flex items-start gap-3 rounded-card border border-line bg-card p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-sunken text-ink-muted"><Apple size={20} /></span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-bold text-ink">iPhone</h3>
              <Badge tone="neutral">{t('ios_badge')}</Badge>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">{t('ios_desc')}</p>
          </div>
        </section>

        {/* Web: works today */}
        <section className="flex flex-col gap-3 rounded-card border border-brand-line bg-brand-soft/40 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-brand text-white"><Globe size={20} /></span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="text-[15px] font-bold text-ink">{t('web_title')}</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">{t('web_desc')}</p>
            </div>
          </div>
          <Link to="/login" className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-sm font-semibold text-white hover:brightness-110">
            {t('web_cta')}
          </Link>
        </section>
      </div>
    </Sheet>
  );
}
