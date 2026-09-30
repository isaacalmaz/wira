import { cx } from './cx';

/** Section title with an optional action on the right ("Lihat semua"). */
export default function SectionHeader({ title, action, className = '', as: Tag = 'h2' }) {
  return (
    <div className={cx('flex items-baseline gap-3 mb-3', className)}>
      <Tag className="flex-1 text-[15px] font-bold tracking-tight text-ink">{title}</Tag>
      {action && <div className="text-[13px] font-semibold text-brand-ink">{action}</div>}
    </div>
  );
}
