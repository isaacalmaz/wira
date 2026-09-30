import { cx } from './cx';

const TONES = {
  neutral: 'bg-sunken text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand-ink border-brand-line',
  pay: 'bg-pay-soft text-pay-ink border-pay-line',
  success: 'bg-success-soft text-success-ink border-success-line',
  warning: 'bg-warning-soft text-warning-ink border-warning-line',
  danger: 'bg-danger-soft text-danger-ink border-danger-line',
};

/** Small status pill. `dot` adds a leading status dot. */
export default function Badge({ tone = 'neutral', dot = false, className = '', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold leading-5', TONES[tone] || TONES.neutral, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
