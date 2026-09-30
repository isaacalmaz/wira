import { forwardRef } from 'react';
import { cx } from './cx';
import Spinner from './Spinner';

// Buttons size to their label (min-height, not fixed height) and wrap long
// text instead of clipping it, so translated labels never show "half".
const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-hover disabled:bg-brand/50',
  secondary: 'bg-card text-ink border border-line-strong hover:bg-sunken',
  ghost: 'text-brand-ink hover:bg-brand-soft',
  danger: 'bg-danger text-white hover:brightness-95',
  'danger-soft': 'bg-danger-soft text-danger-ink border border-danger-line hover:brightness-[0.98]',
  pay: 'bg-pay text-white hover:brightness-95',
  // For use on a brand-coloured surface (e.g. the WiraPay card)
  'on-brand': 'bg-white text-laut-700 hover:bg-laut-50',
  'on-brand-outline': 'border border-white/30 text-white hover:bg-white/10',
};

const SIZES = {
  sm: 'min-h-9 px-3 py-1.5 text-[13px] gap-1.5 rounded-[10px]',
  md: 'min-h-11 px-4 py-2.5 text-sm gap-2 rounded-control',
  lg: 'min-h-[52px] px-5 py-3 text-[15px] gap-2 rounded-[14px]',
};

const Button = forwardRef(function Button(
  { children, variant = 'primary', size = 'md', block = false, isLoading = false, leftIcon, rightIcon, className = '', type = 'button', disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cx(
        'inline-flex items-center justify-center text-center font-semibold leading-tight transition-[background-color,filter,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading ? <Spinner size={16} className="shrink-0" /> : leftIcon && <span className="shrink-0 inline-flex">{leftIcon}</span>}
      <span className="min-w-0">{children}</span>
      {rightIcon && !isLoading && <span className="shrink-0 inline-flex">{rightIcon}</span>}
    </button>
  );
});

export default Button;
