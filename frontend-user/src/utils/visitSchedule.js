// Technician visits (WiraService / WiraPool) are booked in Lombok time
// (WITA, UTC+8) whatever timezone the customer's phone is in. The order
// stores the instant in metadata.scheduled_at; migrations/0089 copies it to
// orders.scheduled_at and rejects times more than an hour in the past.

export const VISIT_SLOTS = ['08:00', '10:00', '13:00', '15:00', '16:30'];

// Earliest bookable slot: at least this long from now, so a technician can
// still accept and travel.
const LEAD_MS = 60 * 60 * 1000;

const witaParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Today's date in Lombok as YYYY-MM-DD. */
export const witaToday = (now = new Date()) => witaParts(now);

/** YYYY-MM-DD in Lombok, `days` after today. */
export const witaDatePlus = (days, now = new Date()) => witaParts(new Date(now.getTime() + days * 86400000));

/** ISO instant for a Lombok date + "HH:MM". */
export const witaInstant = (date, time) => `${date}T${time}:00+08:00`;

/** Slots on `date` that are still bookable. */
export const openSlots = (date, now = new Date()) =>
  VISIT_SLOTS.filter((slot) => new Date(witaInstant(date, slot)).getTime() - now.getTime() >= LEAD_MS);

/** First date (today or later) that still has a bookable slot. */
export const firstBookableDate = (now = new Date()) =>
  (openSlots(witaToday(now), now).length > 0 ? witaToday(now) : witaDatePlus(1, now));
