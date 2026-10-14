import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A photo inside a chat bubble. Tapping it opens the photo full screen
 * (receipts and damage photos are hard to read in a bubble); tap, X or Esc
 * closes it.
 */
export default function ChatImage({ src, alt = '', openLabel, closeLabel }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={openLabel} className="block w-full">
        <img src={src} alt={alt} loading="lazy" className="max-h-72 w-full rounded-[12px] bg-sunken object-cover" />
      </button>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || openLabel}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-3"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-[10px] object-contain" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X size={22} />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
