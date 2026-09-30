import { cx } from './cx';

const TONES = {
  brand: 'bg-brand-soft border-brand-line text-brand-ink',
  pay: 'bg-pay-soft border-pay-line text-pay-ink',
  danger: 'bg-danger-soft border-danger-line text-danger',
  success: 'bg-success-soft border-success-line text-success',
  neutral: 'bg-sunken border-line text-ink-muted',
};
const SIZES = { sm: 'h-9 w-9 rounded-[11px]', md: 'h-11 w-11 rounded-[13px]', lg: 'h-14 w-14 rounded-tile' };

/** A soft square holding a stroke icon. Gold (`pay`) is for money only. */
export default function IconTile({ tone = 'brand', size = 'md', className = '', children }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center border', TONES[tone] || TONES.brand, SIZES[size] || SIZES.md, className)}>
      {children}
    </span>
  );
}
