import { cx } from './cx';

/**
 * Data table shell: hairline card, horizontal scroll on small screens.
 * Write plain <thead>/<tbody>/<tr>/<th>/<td> inside; styling comes from
 * the `.data-table` rules in index.css. Put numbers in `font-mono text-right`.
 */
export default function Table({ className = '', children }) {
  return (
    <div className={cx('overflow-x-auto rounded-card border border-line bg-card', className)}>
      <table className="data-table">{children}</table>
    </div>
  );
}
