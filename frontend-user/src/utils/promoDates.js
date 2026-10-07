// Promo end dates (promos.validUntil, a DATE) are Lombok calendar days: a
// promo "until 31 Oct" works through 23:59 WITA on the 31st. Comparing
// new Date('2026-10-31') (UTC midnight = 08:00 WITA) ended it 16 hours early.
const LOMBOK_TZ = 'Asia/Makassar';

/** Today in Lombok as YYYY-MM-DD. */
export const todayLombok = () => new Date().toLocaleDateString('en-CA', { timeZone: LOMBOK_TZ });

export const isPromoExpired = (validUntil) => !!validUntil && String(validUntil).slice(0, 10) < todayLombok();
