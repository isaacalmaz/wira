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
