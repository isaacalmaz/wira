import { ChevronRight } from 'lucide-react';
import { cx } from './cx';

/**
 * One row: leading visual, title/subtitle, trailing content.
 * Renders as a <button> when onClick is given, or pass `as={Link}` + `to`.
 * `chevron` shows a trailing arrow for navigation rows.
 */
export default function ListRow({ as, leading, title, subtitle, trailing, chevron = false, className = '', ...props }) {
  const Tag = as || (props.onClick ? 'button' : 'div');
  const interactive = Tag !== 'div';
  return (
    <Tag
      type={Tag === 'button' ? 'button' : undefined}
      className={cx(
        'flex w-full items-center gap-3 text-left',
        interactive && 'transition-colors hover:bg-sunken/60',
        className,
      )}
      {...props}
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-ink">{title}</span>
        {subtitle && <span className="truncate text-[12px] text-ink-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      {chevron && <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />}
    </Tag>
  );
}
