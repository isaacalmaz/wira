import { cx } from '../ui';

// On/off switch. The 44px hit area wraps a 32px track; pair it with a
// Badge (success online / neutral offline) at the call site, per DESIGN.md.
const OnlineToggle = ({ isOnline, onChange }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!isOnline}
      onClick={() => onChange(!isOnline)}
      className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span className="sr-only">Toggle Online Status</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-8 w-14 items-center rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand/40 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-ground',
          isOnline ? 'border-success bg-success' : 'border-line-strong bg-sunken',
        )}
      >
        <span
          className={cx(
            'inline-block h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform',
            isOnline ? 'translate-x-[27px]' : 'translate-x-[3px]',
          )}
        />
      </span>
    </button>
  );
};

export default OnlineToggle;
