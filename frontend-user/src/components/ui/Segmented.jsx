import { cx } from './cx';

/** Tabs / filter pills. options: [{ value, label }]. */
export default function Segmented({ options, value, onChange, className = '', size = 'md', scroll = false, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        scroll ? 'flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1' : 'inline-flex gap-1 rounded-control bg-sunken p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(o.value)}
            className={cx(
              'whitespace-nowrap font-semibold transition-colors',
              size === 'sm' ? 'min-h-9 px-3 text-[12.5px]' : 'min-h-11 px-4 text-[13px]',
              scroll
                ? cx('rounded-full border', active ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-line-strong')
                : cx('rounded-[9px] flex-1', active ? 'bg-card text-ink shadow-[0_1px_2px_rgba(6,47,60,0.12)]' : 'text-ink-muted hover:text-ink'),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
