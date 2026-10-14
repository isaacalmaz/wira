import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Badge, Button, Card, Notice, Sheet, Textarea, cx } from '../ui';
import JobPhotoPicker from './JobPhotoPicker';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { uploadPrivateImage } from '../../utils/imageUpload';
import { friendlyError } from '../../utils/friendlyError';

const PREFERRED = ['morning', 'afternoon', 'day_after'];
const STATUS_TONE = { pending: 'warning', accepted: 'success', assigned: 'success', disputed: 'warning', rejected: 'danger' };

/**
 * Warranty on a finished Service or Pool order (migrations/0132): claim it
 * with a description and photos; the technician (or an admin) answers.
 * Also marks a warranty visit as free.
 */
export default function WarrantyCard({ order }) {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const [until, setUntil] = useState(null);
  const [claim, setClaim] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState([]);
  const [preferred, setPreferred] = useState('morning');
  const [sending, setSending] = useState(false);
  const eligibleType = ['service', 'pool'].includes(order.service_type) && order.status === 'completed' && !order.metadata?.warranty_claim_id;

  const load = useCallback(async () => {
    if (!eligibleType) return;
    const [{ data: u }, { data: c }] = await Promise.all([
      supabase.rpc('warranty_until', { p_order_id: order.id }),
      supabase.from('warranty_claims').select('*').eq('order_id', order.id).maybeSingle(),
    ]);
    setUntil(u ? new Date(u) : null);
    setClaim(c || null);
    setLoaded(true);
  }, [order.id, eligibleType]);

  useEffect(() => { load(); }, [load]);

  if (order.metadata?.warranty_claim_id) {
    return <Notice tone="success">{t('warranty.visit_free')}</Notice>;
  }
  if (!eligibleType || !loaded || (!claim && !until)) return null;

  const locale = lang === 'en' ? 'en-GB' : 'id-ID';
  const fmt = (d) => d.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const expired = until && Date.now() > until.getTime();

  const submit = async () => {
    if (desc.trim().length < 10) { toast.error(t('warranty.desc_short')); return; }
    if (photos.length === 0) { toast.error(t('warranty.photo_needed')); return; }
    setSending(true);
    try {
      const paths = await Promise.all(photos.map((f) => uploadPrivateImage(supabase, 'order-photos', user.id, f)));
      const { error } = await supabase.rpc('submit_warranty_claim', {
        p_order_id: order.id, p_description: desc.trim(), p_photos: paths, p_preferred: t(`warranty.pref_${preferred}`),
      });
      if (error) throw error;
      toast.success(t('warranty.sent'));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  const chip = (active) => cx(
    'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
    active ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-card text-ink hover:border-brand',
  );

  return (
    <>
      <Card className={cx('flex flex-col gap-2.5', !claim && !expired && 'border-success-line bg-success-soft')}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <ShieldCheck size={17} className="text-success" aria-hidden="true" />
            {claim ? t('warranty.claim_title') : expired ? t('warranty.expired_title') : t('warranty.active_title')}
          </p>
          {claim && <Badge tone={STATUS_TONE[claim.status] || 'neutral'}>{t(`warranty.status_${claim.status}`)}</Badge>}
        </div>
        {!claim && (
          <p className="text-[13px] leading-relaxed text-ink">
            {expired
              ? t('warranty.expired', { time: fmt(until) })
              : order.service_type === 'pool' ? t('warranty.pool_desc', { time: fmt(until) }) : t('warranty.service_desc', { time: fmt(until) })}
          </p>
        )}
        {claim && (
          <>
            <p className="break-words text-[13px] leading-relaxed text-ink">{claim.description}</p>
            <OrderPhotoThumbs paths={claim.photos} label={t('warranty.photo')} />
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              {claim.status === 'pending' && t('warranty.pending_desc', { time: fmt(new Date(claim.response_due)) })}
              {claim.status === 'disputed' && t('warranty.disputed_desc')}
              {['accepted', 'assigned'].includes(claim.status) && t('warranty.visit_desc')}
              {claim.status === 'rejected' && (claim.admin_note || t('warranty.rejected_desc'))}
            </p>
            {claim.visit_order_id && (
              <Link to={`/active-order/${claim.visit_order_id}`} className="text-[13px] font-semibold text-brand-ink underline">
                {t('warranty.open_visit')}
              </Link>
            )}
          </>
        )}
        {!claim && !expired && <Button onClick={() => setOpen(true)}>{t('warranty.claim_cta')}</Button>}
      </Card>

      <Sheet
        open={open}
        onClose={() => !sending && setOpen(false)}
        title={t('warranty.sheet_title')}
        description={t('warranty.sheet_desc')}
        closeLabel={t('common.close')}
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={sending}>{t('common.cancel')}</Button>
            <Button size="lg" onClick={submit} isLoading={sending}>{t('warranty.send')}</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="warranty-desc" className="text-[13px] font-semibold text-ink">{t('warranty.desc_label')}</label>
            <Textarea id="warranty-desc" rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('warranty.desc_placeholder')} />
          </div>
          <JobPhotoPicker files={photos} onChange={setPhotos} label={t('warranty.photos_label')} />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink">{t('warranty.when_label')}</span>
            <div role="radiogroup" aria-label={t('warranty.when_label')} className="flex flex-wrap gap-2">
              {PREFERRED.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={preferred === p} onClick={() => setPreferred(p)} className={chip(preferred === p)}>
                  {t(`warranty.pref_${p}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}
