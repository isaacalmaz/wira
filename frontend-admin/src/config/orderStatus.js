// Labels and colours for orders.status, the same wording the customer and
// partner apps use. Unknown values fall through unchanged so nothing is
// ever hidden.
export const ORDER_STATUS_LABEL = {
  awaiting_payment: 'Menunggu Pembayaran',
  pending: 'Mencari Mitra',
  accepted: 'Dikonfirmasi',
  preparing: 'Sedang Disiapkan',
  ready: 'Siap Diambil',
  picking_up: 'Menjemput',
  in_trip: 'Dalam Perjalanan',
  on_the_way: 'Menuju Lokasi',
  working: 'Sedang Dikerjakan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
};

// Same per-service wording as the apps (pending means something different
// for a babysitter request, a restaurant or a villa).
const SERVICE_STATUS_LABEL = {
  babysit: { pending: 'Menunggu Persetujuan', on_the_way: 'Pengasuh Menuju Lokasi', working: 'Sesi Berlangsung' },
  food: { pending: 'Menunggu Restoran' },
  villa: { pending: 'Menunggu Konfirmasi' },
};

export const orderStatusLabel = (status, serviceType) =>
  SERVICE_STATUS_LABEL[serviceType]?.[status] || ORDER_STATUS_LABEL[status] || status;

// waiting = warning, in progress = brand, done = success, stopped = danger.
export const orderStatusTone = (status) => {
  if (status === 'pending' || status === 'awaiting_payment') return 'warning';
  if (status === 'completed') return 'success';
  if (status === 'cancelled' || status === 'expired') return 'danger';
  return 'brand';
};
