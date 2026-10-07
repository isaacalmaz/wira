import { useEffect, useRef } from 'react';
import { cx } from './cx';

// Copies each column header onto its body cells as data-label, so the phone
// layout (index.css, .data-table under 768px) can show "Label  value" rows.
// Re-runs when rows change (filters, realtime updates).
// `titleCol` (index) marks the column that heads each phone card (e.g. the
// customer's name instead of an order id or a timestamp).
function labelCells(table, titleCol) {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (!headers.length) return;
  table.querySelectorAll('tbody tr').forEach((tr) => {
    let col = 0;
    [...tr.children].forEach((td) => {
      const isActions = /^(aksi|action)$/i.test(headers[col] || '') || (headers[col] || '') === '';
      const label = isActions ? '' : headers[col];
      if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
      td.classList.toggle('td-actions', isActions && col > 0);
      td.classList.toggle('td-title', titleCol != null && col === titleCol);
      col += Number(td.getAttribute('colspan')) || 1;
    });
  });
}

/**
 * Data table shell: hairline card, horizontal scroll on tablets/desktop,
 * stacked cards on phones. Write plain <thead>/<tbody>/<tr>/<th>/<td>
 * inside; styling comes from the `.data-table` rules in index.css. Put
 * numbers in `font-mono text-right`.
 */
export default function Table({ className = '', titleCol = null, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return undefined;
    labelCells(table, titleCol);
    const observer = new MutationObserver(() => labelCells(table, titleCol));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [titleCol]);

  return (
    <div className={cx('table-shell overflow-x-auto rounded-card border border-line bg-card', className)}>
      <table ref={ref} className="data-table" data-titled={titleCol != null ? '' : undefined}>{children}</table>
    </div>
  );
}
