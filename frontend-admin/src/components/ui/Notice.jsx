import { Info, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { cx } from './cx';

const TONES = {
  info: ['bg-brand-soft border-brand-line text-brand-ink', Info],
  warning: ['bg-warning-soft border-warning-line text-warning-ink', AlertTriangle],
  danger: ['bg-danger-soft border-danger-line text-danger-ink', AlertCircle],
  success: ['bg-success-soft border-success-line text-success-ink', CheckCircle2],
};

/** Inline message box (insufficient balance, pending top-up, errors). */
export default function Notice({ tone = 'info', title, children, action, className = '' }) {
  const [cls, Icon] = TONES[tone] || TONES.info;
  return (
    <div className={cx('flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-[13px] leading-relaxed', cls, className)}>
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'opacity-90' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
