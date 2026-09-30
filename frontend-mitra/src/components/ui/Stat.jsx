import { cx } from './cx';
import IconTile from './IconTile';

/**
 * A key figure: label, big mono value, optional icon and hint line.
 * tone colours the icon tile only; use `pay` for money figures.
 */
export default function Stat({ label, value, icon, tone = 'brand', hint, className = '' }) {
  return (
    <div className={cx('flex flex-col gap-3 rounded-card border border-line bg-card p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</span>
        {icon && <IconTile tone={tone} size="sm">{icon}</IconTile>}
      </div>
      <span className="font-mono text-[26px] font-medium leading-none tracking-tight text-ink">{value}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}
