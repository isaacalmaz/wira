import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cx } from './cx';

/**
 * Title block at the top of a page. `back` shows a back button
 * (true = history back, or a path string). `actions` sits on the right.
 */
export default function PageHeader({ title, subtitle, back, backLabel = 'Kembali', actions, eyebrow, className = '' }) {
  const navigate = useNavigate();
  const goBack = () => (typeof back === 'string' ? navigate(back) : navigate(-1));
  return (
    <div className={cx('flex items-start gap-3 mb-5', className)}>
      {back && (
        <button
          type="button"
          onClick={goBack}
          aria-label={backLabel}
          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunken"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {eyebrow && <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{eyebrow}</span>}
        <h1 className="text-[22px] sm:text-2xl font-extrabold tracking-tight leading-tight text-balance">{title}</h1>
        {subtitle && <p className="text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
