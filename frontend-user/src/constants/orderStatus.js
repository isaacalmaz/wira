/**
 * Canonical order status vocabulary for the Wira `orders` table.
 * This is the single source of truth for status values across the
 * whole system (frontend-user, frontend-mitra).
 * Any app writing to `orders.status` must use these exact values.
 */
export const OrderStatus = {
  // Pool/Villa paid by QRIS: hidden from mitra until the payment arrives
  // (migrations/0077, 0078), then it becomes 'pending'.
  AWAITING_PAYMENT: 'awaiting_payment',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKING_UP: 'picking_up',
  IN_TRIP: 'in_trip',
  ON_THE_WAY: 'on_the_way',
  WORKING: 'working',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const STATUS_KEYS = new Set(Object.values(OrderStatus));

/**
 * Dictionary key for a raw DB status value, e.g. 'pending' -> 'status.pending'.
 * Unknown/legacy values fall back to 'status.unknown' so a customer never sees
 * a raw database token like `picking_up` on screen. Pass the result to the
 * `t()` returned by useTranslation(); every key here exists in id.json and
 * en.json.
 */
export function getStatusKey(rawStatus) {
  const normalized = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';
  return STATUS_KEYS.has(normalized) ? `status.${normalized}` : 'status.unknown';
}
