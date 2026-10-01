import { BadgeCheck, Star } from 'lucide-react';
import { Badge, cx } from '../../components/ui';
import { avatarSrc } from '../../utils/avatar';

// Skills customers can book directly (migrations/0090 price menu) and where.
export const BOOKABLE = { AC: '/service', Listrik: '/service', Plumbing: '/service', Tukang: '/service', Pool: '/pool' };

export function Avatar({ tech, size = 'md' }) {
  const src = avatarSrc(tech.avatar_url);
  const cls = size === 'lg' ? 'h-20 w-20 text-[26px]' : 'h-12 w-12 text-[16px]';
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft font-bold text-brand-ink', cls)}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (tech.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function RatingLine({ tech, t }) {
  if (tech.rating_count >= 3) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <Star size={13} className="fill-pay text-pay" aria-hidden="true" />
        {t('service.rating_line', { avg: Number(tech.rating_avg).toFixed(1), count: tech.rating_count })}
      </span>
    );
  }
  return <span className="text-[12.5px] font-semibold text-brand-ink">{t('service.new_partner')}</span>;
}

export function TrustBadges({ tech, t }) {
  return (
    <>
      {tech.verified && <Badge tone="success"><BadgeCheck size={12} aria-hidden="true" /> {t('partners.verified')}</Badge>}
      {tech.top_rated && <Badge tone="pay">{t('service.top_rated')}</Badge>}
    </>
  );
}
