import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { cx } from '../ui';

// Dates are plain 'YYYY-MM-DD' strings in local (WITA) time, the same
// shape the database stores in orders.check_in (migrations/0104).
const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const nightsBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
const MAX_NIGHTS = 30;

/**
 * Month calendar for a villa stay. Nights already booked or closed by the
 * host (get_villa_unavailable) cannot be picked; the guest taps a check-in
 * day, then a check-out day. A check-out may fall on a taken night (the
 * guest leaves that morning).
 */
export default function StayCalendar({ villaId, checkIn, checkOut, onChange }) {
  const { t, lang } = useTranslation();
  const today = toKey(new Date());
  const [taken, setTaken] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = fromKey(checkIn || today); return new Date(d.getFullYear(), d.getMonth(), 1); });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.rpc('get_villa_unavailable', { p_merchant_id: villaId, p_from: today, p_to: addDays(today, 366) })
      .then(({ data }) => {
        if (!alive) return;
        const nights = new Set();
        (data || []).forEach((r) => {
          for (let k = r.date_from; k < r.date_to; k = addDays(k, 1)) nights.add(k);
        });
        setTaken(nights);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [villaId, today]);

  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toKey(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [month]);

  const rangeFree = (from, to) => {
    for (let k = from; k < to; k = addDays(k, 1)) if (taken.has(k)) return false;
    return true;
  };

  const pick = (k) => {
    if (k < today) return;
    if (!checkIn || checkOut || k <= checkIn) {
      if (taken.has(k)) return;
      onChange({ checkIn: k, checkOut: null });
      return;
    }
    if (nightsBetween(checkIn, k) > MAX_NIGHTS || !rangeFree(checkIn, k)) {
      if (!taken.has(k)) onChange({ checkIn: k, checkOut: null });
      return;
    }
    onChange({ checkIn, checkOut: k });
  };

  const monthLabel = month.toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { weekday: 'narrow' }));
  const atStart = month <= new Date(fromKey(today).getFullYear(), fromKey(today).getMonth(), 1);
  const atEnd = month >= new Date(fromKey(today).getFullYear() + 1, fromKey(today).getMonth(), 1);

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-card p-3" aria-busy={loading}>
      <div className="flex items-center justify-between">
        <button type="button" disabled={atStart} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label={t('villa.cal_prev')} className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-sunken disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <p className="text-[14px] font-semibold capitalize text-ink">{monthLabel}</p>
        <button type="button" disabled={atEnd} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label={t('villa.cal_next')} className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-sunken disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-ink-muted">
        {weekdays.map((w, i) => <span key={i} className="py-1">{w}</span>)}
      </div>
      <div className="flex flex-col gap-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map((k, di) => {
              if (!k) return <span key={di} />;
              const past = k < today;
              const isTaken = taken.has(k);
              const isStart = k === checkIn;
              const isEnd = k === checkOut;
              const inRange = checkIn && checkOut && k > checkIn && k < checkOut;
              const canBeCheckout = checkIn && !checkOut && k > checkIn && nightsBetween(checkIn, k) <= MAX_NIGHTS && rangeFree(checkIn, k);
              const disabled = past || (isTaken && !canBeCheckout);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(k)}
                  aria-pressed={isStart || isEnd}
                  aria-label={`${fromKey(k).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'long' })}${isTaken ? `, ${t('villa.cal_taken')}` : ''}`}
                  className={cx(
                    'relative flex h-10 items-center justify-center rounded-control font-mono text-[13px] transition-colors',
                    isStart || isEnd ? 'bg-brand font-semibold text-white'
                      : inRange ? 'bg-brand-soft text-brand-ink'
                        : disabled ? 'text-ink-muted/50'
                          : 'text-ink hover:bg-sunken',
                    isTaken && !isStart && !isEnd && !inRange && 'line-through',
                  )}
                >
                  {fromKey(k).getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11.5px] text-ink-muted">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-middle" />{t('villa.cal_selected')}</span>
        <span><span className="line-through">17</span> {t('villa.cal_taken')}</span>
        {loading && <span>{t('villa.cal_loading')}</span>}
      </p>
    </div>
  );
}
