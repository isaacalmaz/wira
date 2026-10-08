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

const DISPLAY_LABEL_ID = {
  [OrderStatus.AWAITING_PAYMENT]: 'Menunggu Pembayaran',
  [OrderStatus.PENDING]: 'Mencari Mitra',
  [OrderStatus.ACCEPTED]: 'Dikonfirmasi',
  [OrderStatus.PREPARING]: 'Sedang Disiapkan',
  [OrderStatus.READY]: 'Siap Diambil',
  [OrderStatus.PICKING_UP]: 'Menjemput',
  [OrderStatus.IN_TRIP]: 'Dalam Perjalanan',
  [OrderStatus.ON_THE_WAY]: 'Menuju Lokasi',
  [OrderStatus.WORKING]: 'Sedang Dikerjakan',
  [OrderStatus.COMPLETED]: 'Selesai',
  [OrderStatus.CANCELLED]: 'Dibatalkan',
};

// Same per-service wording as the customer app and admin panel.
const SERVICE_STATUS_LABEL = {
  babysit: { [OrderStatus.PENDING]: 'Menunggu Persetujuan', [OrderStatus.ON_THE_WAY]: 'Pengasuh Menuju Lokasi', [OrderStatus.WORKING]: 'Sesi Berlangsung' },
  food: { [OrderStatus.PENDING]: 'Menunggu Restoran' },
  villa: { [OrderStatus.PENDING]: 'Menunggu Konfirmasi' },
};

/** Indonesian display label for a raw DB status value. Falls back to the raw value if unknown. */
export function getDisplayStatus(rawStatus, serviceType) {
  return SERVICE_STATUS_LABEL[serviceType]?.[rawStatus] || DISPLAY_LABEL_ID[rawStatus] || rawStatus;
}

// waiting = warning, in progress = brand, done = success, stopped = danger.
export function statusTone(status) {
  if (status === OrderStatus.PENDING || status === OrderStatus.AWAITING_PAYMENT) return 'warning';
  if (status === OrderStatus.COMPLETED) return 'success';
  if (status === OrderStatus.CANCELLED || status === 'expired') return 'danger';
  return 'brand';
}
