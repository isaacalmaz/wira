import { forwardRef } from 'react';
import { cx } from './cx';

const control = 'block w-full rounded-control border border-line-strong bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 shadow-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-sunken disabled:text-ink-muted';

/** Label + control + hint/error. Pass the control as children. */
export function Field({ label, htmlFor, hint, error, required, className = '', children }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', invalid, ...props }, ref) {
  return <input ref={ref} className={cx(control, 'min-h-11 py-2.5', invalid && 'border-danger focus:border-danger focus:ring-danger/20', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', invalid, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(control, 'py-2.5 leading-relaxed', invalid && 'border-danger', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', invalid, children, ...props }, ref) {
  return <select ref={ref} className={cx(control, 'min-h-11 py-2.5 pr-9', invalid && 'border-danger', className)} {...props}>{children}</select>;
});

export default Field;
