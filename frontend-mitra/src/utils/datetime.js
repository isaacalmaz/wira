// One date format across Wira, in Lombok time (WITA):
//   formatDateTime -> "8 Okt, 23.22" (year added when it is not this year)
//   formatDate     -> "8 Okt 2026"
const TZ = 'Asia/Makassar';

const toDate = (value) => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateTime = (value, locale = 'id-ID') => {
  const d = toDate(value);
  if (!d) return '-';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: TZ });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `${date}, ${time}`;
};

export const formatDate = (value, locale = 'id-ID') => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
};

// Bookings store a schedule as "2026-10-10 pukul 08:00" (the partner app
// reads that exact text), so it is only prettified for display:
//   formatScheduleDay("2026-10-10") -> "Sab, 10 Okt"
//   formatClock("08:00")            -> "08.00"
//   prettySchedule(text)            -> every "YYYY-MM-DD[ pukul HH:MM]" in text
export const formatScheduleDay = (ymd, locale = 'id-ID') => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const sameYear = Number(m[1]) === new Date().getFullYear();
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
};

export const formatClock = (hhmm, locale = 'id-ID') => {
  const m = String(hhmm || '').match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return hhmm;
  return `${m[1].padStart(2, '0')}${locale.startsWith('en') ? ':' : '.'}${m[2]}`;
};

export const prettySchedule = (text, locale = 'id-ID') => String(text ?? '').replace(
  /(\d{4}-\d{2}-\d{2})(?: pukul (\d{1,2}[:.]\d{2}))?/g,
  (_, day, time) => (time
    ? `${formatScheduleDay(day, locale)} ${locale.startsWith('en') ? 'at' : 'pukul'} ${formatClock(time, locale)}`
    : formatScheduleDay(day, locale)),
);
