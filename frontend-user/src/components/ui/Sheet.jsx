import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from './cx';

const WIDTHS = { sm: 'md:max-w-sm', md: 'md:max-w-md', lg: 'md:max-w-lg', xl: 'md:max-w-2xl' };

/**
 * The one modal for the customer app.
 * Phone: a bottom sheet (handle, rounded top, safe-area padding).
 * Tablet/desktop: a centred dialog.
 *
 * Props: open, onClose, title, description, icon (node shown above title),
 * tone ('default' | 'danger' | 'pay' tints the icon badge), footer (buttons;
 * stacked full-width on phones), size, dismissible (backdrop/Esc close).
 */
export default function Sheet({
  open, onClose, title, description, icon, tone = 'default', footer, children,
  size = 'md', dismissible = true, className = '', bodyClassName = '', closeLabel = 'Tutup',
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  // Callers usually pass an inline arrow; keep the latest one in a ref so the
  // open effect below runs once per open, not on every parent re-render
  // (re-running it moved focus back to the first field on each keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector('[data-autofocus], input, textarea, select, button:not([data-sheet-close])');
      (el || panelRef.current)?.focus?.();
    }, 30);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, dismissible]);

  if (!open) return null;

  const badge = {
    default: 'bg-brand-soft text-brand-ink',
    danger: 'bg-danger-soft text-danger',
    pay: 'bg-pay-soft text-pay-ink',
    success: 'bg-success-soft text-success',
  }[tone] || 'bg-brand-soft text-brand-ink';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-laut-900/55 backdrop-blur-[1px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-ground text-ink shadow-sheet outline-none',
          'rounded-t-sheet md:rounded-sheet md:mx-4',
          'max-h-[92dvh] flex flex-col',
          WIDTHS[size] || WIDTHS.md,
          className,
        )}
      >
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        {(title || icon) && (
          <div className="flex items-start gap-3 px-5 md:px-6 pt-3 md:pt-6 shrink-0">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {icon && <span className={cx('mb-1.5 inline-flex h-11 w-11 items-center justify-center rounded-[14px]', badge)}>{icon}</span>}
              {title && <h2 id={titleId} className="text-xl font-extrabold tracking-tight leading-snug text-balance">{title}</h2>}
              {description && <p id={descId} className="text-sm leading-relaxed text-ink-muted">{description}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                data-sheet-close
                onClick={onClose}
                aria-label={closeLabel}
                className="-mr-1.5 -mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-sunken"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className={cx('px-5 md:px-6 py-4 overflow-y-auto overscroll-contain flex-1 min-h-0', bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="px-5 md:px-6 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-6 shrink-0 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        )}
        {!footer && <div className="h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}
