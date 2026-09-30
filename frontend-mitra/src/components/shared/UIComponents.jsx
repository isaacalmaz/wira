// Legacy shared components, now thin wrappers over the Tenun Laut kit in
// components/ui so every existing caller picks up the new look. New code
// should import from '../ui' directly (see DESIGN.md).
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import UICard from '../ui/Card';
import UIButton from '../ui/Button';
import UIBadge from '../ui/Badge';
import UIEmptyState from '../ui/EmptyState';
import IconTile from '../ui/IconTile';

export const Card = ({ children, className = '', ...props }) => (
  <UICard padding="none" className={`overflow-hidden ${className}`} {...props}>{children}</UICard>
);

const BADGE_TONES = { primary: 'brand', success: 'success', warning: 'warning', danger: 'danger', gray: 'neutral' };
export const Badge = ({ children, variant = 'primary', dot = false }) => (
  <UIBadge tone={BADGE_TONES[variant] || 'brand'} dot={dot}>{children}</UIBadge>
);

const BUTTON_VARIANTS = { outline: 'secondary', secondary: 'secondary' };
export const Button = ({ variant = 'primary', ...props }) => (
  <UIButton variant={BUTTON_VARIANTS[variant] || variant} {...props} />
);

export const StarRating = ({ rating = 5 }) => (
  <div className="flex text-ink" aria-label={`${rating}/5`}>
    {[...Array(5)].map((_, i) => (
      <Star key={i} size={16} fill={i < rating ? 'currentColor' : 'none'} className={i >= rating ? 'text-line-strong' : ''} />
    ))}
  </div>
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <UIEmptyState icon={Icon ? <Icon size={24} /> : null} title={title} description={description} action={action} />
);

/**
 * Generic modal shell (callers render their own header/body inside).
 * Bottom sheet on phones, centred dialog from md up; one managed z-index.
 * Prefer components/ui/Sheet for new dialogs.
 */
export const Modal = ({ isOpen, onClose, children, className = '', closeOnBackdrop = true }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && closeOnBackdrop) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [isOpen, closeOnBackdrop, onClose]);

  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-laut-900/55" onClick={closeOnBackdrop ? onClose : undefined} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-h-[92dvh] overflow-y-auto bg-ground text-ink shadow-sheet rounded-t-sheet md:rounded-sheet pb-[env(safe-area-inset-bottom)] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

/** "icon + big number + label" tile for home dashboards. */
export const StatTile = ({ icon: Icon, value, label, tone = 'brand' }) => (
  <UICard padding="md" className="flex flex-col items-start gap-3">
    {Icon && <IconTile tone={tone} size="sm"><Icon size={18} /></IconTile>}
    <span className="font-mono text-[24px] font-medium leading-none tracking-tight text-ink">{value}</span>
    <span className="text-xs text-ink-muted">{label}</span>
  </UICard>
);
