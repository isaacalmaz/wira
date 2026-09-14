/**
 * Canonical order status vocabulary for the Wira `orders` table.
 * This is the single source of truth for status values across the
 * whole system (frontend-user, frontend-mitra, frontend-partner).
 * Any app writing to `orders.status` must use these exact values.
 */
export const OrderStatus = {
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
  [OrderStatus.PENDING]: 'Sedang Mencari',
  [OrderStatus.ACCEPTED]: 'Dikonfirmasi',
  [OrderStatus.PREPARING]: 'Sedang Disiapkan',
  [OrderStatus.READY]: 'Siap Diambil',
  [OrderStatus.PICKING_UP]: 'Sedang Dijemput',
  [OrderStatus.IN_TRIP]: 'Sedang Berjalan',
  [OrderStatus.ON_THE_WAY]: 'Teknisi Menuju Lokasi',
  [OrderStatus.WORKING]: 'Sedang Dikerjakan',
  [OrderStatus.COMPLETED]: 'Selesai',
  [OrderStatus.CANCELLED]: 'Dibatalkan',
};

/** Indonesian display label for a raw DB status value. Falls back to the raw value if unknown. */
export function getDisplayStatus(rawStatus) {
  return DISPLAY_LABEL_ID[rawStatus] || rawStatus;
}
