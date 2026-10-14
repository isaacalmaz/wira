import { cx } from './cx';
import IconTile from './IconTile';
import Money from './Money';

/**
 * A key figure: label, big mono value, optional icon and hint line.
 * tone colours the icon tile only; use `pay` for money figures.
 * Built to survive half-width phone cards and Android's large-text setting:
 * the card may shrink, a long label wraps, the icon keeps its size, and the
 * value wraps as a last resort instead of running out of the card.
 */
export default function Stat({ label, value, icon, tone = 'brand', hint, className = '' }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-3 rounded-card border border-line bg-card p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1 break-words text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted sm:tracking-[0.1em]">{label}</span>
        {icon && <IconTile tone={tone} size="sm">{icon}</IconTile>}
      </div>
      <span className="min-w-0 font-mono text-[26px] font-medium leading-none tracking-tight text-ink [overflow-wrap:anywhere]">{value}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

/**
 * A money value for a Stat: a small "Rp" that may sit on its own line above
 * the amount, so big figures fit a half-width phone card with large text.
 */
export function StatMoney({ value, className = '' }) {
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span className="font-sans text-[15px] font-semibold text-ink-muted">Rp</span>
      <Money value={value} plain />
    </span>
  );
}
