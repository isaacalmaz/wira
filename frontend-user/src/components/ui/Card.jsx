import { cx } from './cx';

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5 sm:p-6' };

// A surface. Hairline border, no shadow: separation comes from the line.
// Pass `as="button"` / `as={Link}` for a tappable card.
export default function Card({ as: Tag = 'div', padding = 'md', interactive = false, className = '', children, ...props }) {
  const clickable = interactive || Tag !== 'div' || !!props.onClick;
  return (
    <Tag
      className={cx(
        'block bg-card border border-line rounded-card text-left',
        PADDING[padding] ?? PADDING.md,
        clickable && 'cursor-pointer transition-colors hover:border-line-strong hover:bg-card/80 w-full',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
