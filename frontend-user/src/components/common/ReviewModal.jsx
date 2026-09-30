import { useState } from 'react';
import { supabase } from '../../config/supabase';
import { Star, X } from 'lucide-react';
import Button from './Button';
import { toast } from 'react-hot-toast';
import { useTranslation } from '../../i18n';

export default function ReviewModal({ order, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 animate-in slide-in-from-bottom-10 sm:zoom-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
          className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-white"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t('review.title')}</h2>
          <p className="text-sm text-slate-500">{t('review.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Star Rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                title={t('review.star_label', { count: star })}
                aria-label={t('review.star_label', { count: star })}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  size={40}
                  className={`${
                    (hoverRating || rating) >= star 
                      ? 'fill-amber-400 text-amber-400' 
                      : 'fill-slate-100 text-slate-200 dark:fill-slate-800 dark:text-slate-700'
                  } transition-colors`}
                />
              </button>
            ))}
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {t('review.comment_label')}
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t('review.comment_placeholder')}
              rows={3}
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl dark:text-white focus:ring-2 focus:ring-primary/50 resize-none placeholder-slate-400"
            />
          </div>

          {/* Tipping (Only if driver exists) */}
          {order.driver_id && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('review.tip_label')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {presetTips.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTipAmount(amount)}
                    className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                      tipAmount === amount 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    {amount === 0 ? t('review.tip_none') : `Rp${amount / 1000}k`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
            {isSubmitting ? t('common.processing') : t('review.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
