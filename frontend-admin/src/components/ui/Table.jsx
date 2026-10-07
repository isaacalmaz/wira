import { useEffect, useRef } from 'react';
import { cx } from './cx';

// Copies each column header onto its body cells as data-label, so the phone
// layout (index.css, .data-table under 768px) can show "Label  value" rows.
// Re-runs when rows change (filters, realtime updates).
function labelCells(table) {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (!headers.length) return;
  table.querySelectorAll('tbody tr').forEach((tr) => {
    let col = 0;
    [...tr.children].forEach((td) => {
      const label = /^(aksi|action)$/i.test(headers[col] || '') ? '' : (headers[col] || '');
      if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
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
export default function Table({ className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return undefined;
    labelCells(table);
    const observer = new MutationObserver(() => labelCells(table));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cx('table-shell overflow-x-auto rounded-card border border-line bg-card', className)}>
      <table ref={ref} className="data-table">{children}</table>
    </div>
  );
}
