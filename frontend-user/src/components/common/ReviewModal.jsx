import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../config/supabase';
import { Star, ImagePlus, X } from 'lucide-react';
import { Button, Sheet, Field, Textarea, cx } from '../ui';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../../i18n';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { NEGATIVE_TAGS, POSITIVE_TAGS } from '../../utils/review';
import { friendlyError } from '../../utils/friendlyError';
import { WALLET_ENABLED } from '../../config/wallet';

const MAX_PHOTOS = 3;

/**
 * Rate a finished order (migrations/0091): stars, quick tags, an optional
 * comment, up to three photos and, for drivers/technicians, a tip.
 */
export default function ReviewModal({ order, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [reviewText, setReviewText] = useState('');
  const [photos, setPhotos] = useState([]); // File[]
  const [previews, setPreviews] = useState([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();
  const commentId = useId();
  const fileId = useId();
  const fileRef = useRef(null);

  const presetTips = [0, 2000, 5000, 10000];
  // Praise for a good visit, the usual problems for a poor one.
  const tagOptions = rating === 0 ? [] : rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS;

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const pickRating = (value) => {
    // Switching between good and poor clears tags from the other list.
    if ((value >= 4) !== (rating >= 4)) setTags([]);
    setRating(value);
  };

  const toggleTag = (tag) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.some((f) => f.size > 10 * 1024 * 1024)) {
      toast.error(t('review.photo_too_big'));
      return;
    }
    setPhotos((cur) => [...cur, ...files].slice(0, MAX_PHOTOS));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error(t('review.no_rating'));
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUrls = [];
      if (photos.length > 0) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error(t('review.session_expired'));
        photoUrls = await Promise.all(photos.map((f) => uploadImageToBucket(supabase, 'review-photos', auth.user.id, f)));
      }

      const { error } = await supabase.rpc('submit_review_and_tip', {
        p_order_id: order.id,
        p_rating: rating,
        p_review_text: reviewText,
        p_tip_amount: tipAmount,
        p_tags: tags,
        p_photos: photoUrls,
      });
      if (error) throw error;

      toast.success(t('review.success'));
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Submit review error:', err);
      toast.error(t('review.failed', { message: friendlyError(err) }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!order) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title={t('review.title')}
      description={t('review.subtitle')}
      icon={<Star size={22} />}
      closeLabel={t('common.close')}
      footer={
        <Button type="submit" form={formId} size="lg" isLoading={isSubmitting} disabled={rating === 0}>
          {isSubmitting ? t('common.processing') : t('review.submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Star Rating */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex justify-center gap-1" role="group" aria-label={t('review.title')}>
            {[1, 2, 3, 4, 5].map((star) => {
              const lit = (hoverRating || rating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => pickRating(star)}
                  title={t('review.star_label', { count: star })}
                  aria-label={t('review.star_label', { count: star })}
                  aria-pressed={rating >= star}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-control transition-transform hover:scale-105 active:scale-95"
                >
                  <Star
                    size={36}
                    strokeWidth={1.6}
                    className={cx('transition-colors', lit ? 'fill-pay text-pay' : 'fill-sunken text-line-strong')}
                  />
                </button>
              );
            })}
          </div>
          {rating > 0 && <p className="text-[13px] font-semibold text-ink">{t(`review.rating_word.${rating}`)}</p>}
        </div>

        {/* Quick tags */}
        {tagOptions.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-ink">
              {rating >= 4 ? t('review.tags_good') : t('review.tags_bad')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleTag(tag)}
                    className={cx(
                      'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                      on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-line-strong',
                    )}
                  >
                    {t(`review.tag.${tag}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Review Text */}
        <Field label={t('review.comment_label')} htmlFor={commentId}>
          <Textarea
            id={commentId}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder={t('review.comment_placeholder')}
            rows={3}
            maxLength={1000}
            className="resize-none"
          />
        </Field>

        {/* Photos */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink">{t('review.photos_label')}</span>
          <div className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative h-20 w-20 overflow-hidden rounded-control border border-line">
                <img src={src} alt={t('review.photo_alt', { n: i + 1 })} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}
                  aria-label={t('review.photo_remove', { n: i + 1 })}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label
                htmlFor={fileId}
                className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-ink-muted transition-colors hover:border-brand hover:text-brand-ink"
              >
                <ImagePlus size={20} aria-hidden="true" />
                <span className="text-[11px] font-semibold">{t('review.photo_add')}</span>
              </label>
            )}
            <input ref={fileRef} id={fileId} type="file" accept="image/*" multiple onChange={addPhotos} className="sr-only" />
          </div>
        </div>

        {/* Tipping (Only if driver exists). Tips come out of WiraPay, so web only. */}
        {WALLET_ENABLED && order.driver_id && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink">{t('review.tip_label')}</span>
            <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
              {presetTips.map((amount) => {
                const selected = tipAmount === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTipAmount(amount)}
                    aria-pressed={selected}
                    className={cx(
                      'min-h-11 rounded-control border px-2 py-2 text-[13px] font-semibold leading-tight transition-colors',
                      selected
                        ? 'border-brand bg-brand-soft text-brand-ink ring-1 ring-brand'
                        : 'border-line-strong bg-card text-ink hover:bg-sunken',
                      amount !== 0 && 'font-mono font-medium',
                    )}
                  >
                    {amount === 0 ? t('review.tip_none') : `Rp${amount / 1000}k`}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
