import { useId, useState } from 'react';
import { supabase } from '../../config/supabase';
import { Star } from 'lucide-react';
import { Button, Sheet, Field, Textarea, cx } from '../ui';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../../i18n';

export default function ReviewModal({ order, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();
  const commentId = useId();

  const presetTips = [0, 2000, 5000, 10000];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error(t('review.no_rating'));
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_review_and_tip', {
        p_order_id: order.id,
        p_rating: rating,
        p_review_text: reviewText,
        p_tip_amount: tipAmount
      });

      if (error) {
        throw error;
      }

      toast.success(t('review.success'));
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Submit review error:', err);
      toast.error(t('review.failed', { message: err.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!order) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('review.title')}
      description={t('review.subtitle')}
      icon={<Star size={22} />}
      closeLabel={t('common.close')}
      footer={
        <Button type="submit" form={formId} size="lg" isLoading={isSubmitting}>
          {isSubmitting ? t('common.processing') : t('review.submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Star Rating */}
        <div className="flex justify-center gap-1" role="group" aria-label={t('review.title')}>
          {[1, 2, 3, 4, 5].map((star) => {
            const lit = (hoverRating || rating) >= star;
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                title={t('review.star_label', { count: star })}
                aria-label={t('review.star_label', { count: star })}
                aria-pressed={rating >= star}
                className="inline-flex h-12 w-12 items-center justify-center rounded-control transition-transform hover:scale-105 active:scale-95"
              >
                <Star
                  size={36}
                  strokeWidth={1.6}
                  className={cx('transition-colors', lit ? 'fill-brand text-brand' : 'fill-sunken text-line-strong')}
                />
              </button>
            );
          })}
        </div>

        {/* Review Text */}
        <Field label={t('review.comment_label')} htmlFor={commentId}>
          <Textarea
            id={commentId}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder={t('review.comment_placeholder')}
            rows={3}
            className="resize-none"
          />
        </Field>

        {/* Tipping (Only if driver exists) */}
        {order.driver_id && (
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
