import { cx } from './cx';
import IconTile from './IconTile';

/** Honest empty state: what is missing, and the one action that fixes it. */
export default function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-card/60 px-6 py-10 text-center', className)}>
      {icon && <IconTile tone="neutral" size="lg">{icon}</IconTile>}
      <div className="flex flex-col gap-1 max-w-sm">
        <p className="text-[15px] font-bold text-ink text-balance">{title}</p>
        {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
