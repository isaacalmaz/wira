// One place for "how much did I earn today / this week" across the driver,
// merchant and technician portals. Days are Lombok calendar days (WITA) and
// an order counts on the day it was completed (status_changed_at,
// migrations/0088), not the day it was booked.
export const LOMBOK_TZ = 'Asia/Makassar';
const WITA_OFFSET_MS = 8 * 3600000;
const DAY_MS = 86400000;
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const dayKey = (d) => d.toLocaleDateString('id-ID', { timeZone: LOMBOK_TZ });

export const completedAt = (order) => new Date(order.status_changed_at || order.created_at);

/** Midnight today in Lombok, as an ISO timestamp (for .gte() filters). */
export function startOfTodayISO(now = new Date()) {
  const local = new Date(now.getTime() + WITA_OFFSET_MS);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightUtc - WITA_OFFSET_MS).toISOString();
}

/** Columns every earnings query needs for summarizeEarnings + the *EarnedAmount helpers. */
export const EARNINGS_COLUMNS =
  'id, total_price, delivery_fee, material_amount, payment_method, driver_id, merchant_id, created_at, status_changed_at, service_type, status, commission_rate';

/**
 * Today, the last 7 days (today included) and one bar per day.
 * `amount(order)` is the partner's share; `cash(order)` what a Tunai order
 * took back out of the saldo (both from services/orderService.js).
 */
export function summarizeEarnings(orders, { amount, cash = () => 0 }, now = new Date()) {
  const todayStart = new Date(startOfTodayISO(now)).getTime();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = todayStart - i * DAY_MS;
    const d = new Date(start + 12 * 3600000);
    days.push({ start, dateStr: dayKey(d), day: DAY_NAMES[new Date(start + WITA_OFFSET_MS).getUTCDay()], amount: 0 });
  }
  const weekStart = days[0].start;

  let today = 0;
  let week = 0;
  let cashTotal = 0;
  for (const o of orders || []) {
    if (o.status && o.status !== 'completed') continue;
    const t = completedAt(o).getTime();
    if (t < weekStart) continue;
    const value = amount(o);
    week += value;
    cashTotal += cash(o);
    if (t >= todayStart) today += value;
    const slot = days.find((d) => t >= d.start && t < d.start + DAY_MS);
    if (slot) slot.amount += value;
  }
  return { today, week, cash: cashTotal, days };
}
