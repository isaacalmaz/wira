import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { searchAccounts, KIND_META } from '../../services/peopleAdminService';
import { cx } from '../ui';

/**
 * Sidebar search: name, email or phone -> Profil Akun. Debounced, keyboard
 * friendly (arrows + Enter), closes on select.
 */
export default function AccountSearch({ onNavigate }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return undefined; }
    timer.current = setTimeout(() => {
      searchAccounts(q.trim()).then((rows) => { setResults(rows); setActive(-1); }).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = (row) => {
    setOpen(false);
    setQ('');
    navigate(`/accounts/${row.id}`);
    onNavigate?.();
  };

  const onKeyDown = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[Math.max(active, 0)]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor="account-search" className="sr-only">Cari akun</label>
      <div className="flex items-center gap-2 rounded-control border border-line bg-ground px-3">
        <Search size={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          id="account-search"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Cari nama, HP, email…"
          autoComplete="off"
          className="min-h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-card border border-line bg-card py-1 shadow-pop" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-[12.5px] text-ink-muted">Tidak ada akun yang cocok.</li>
          ) : results.map((r, i) => {
            const kinds = Array.isArray(r.mitra_access) ? r.mitra_access : [];
            const tag = r.status === 'Dihapus' ? 'Dihapus'
              : kinds.length ? kinds.map((k) => KIND_META[k]?.label || k).join(', ')
              : ['user', 'mitra', null].includes(r.role) ? 'Pelanggan' : r.role;
            return (
              <li key={r.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(r)}
                  className={cx('flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-sunken', i === active && 'bg-sunken')}
                >
                  <span className="text-[13px] font-semibold text-ink">{r.name || 'Tanpa nama'}</span>
                  <span className="text-[11.5px] text-ink-muted">{tag}{r.phone ? ` · ${r.phone}` : r.email ? ` · ${r.email}` : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
