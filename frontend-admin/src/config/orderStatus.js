// Staff-facing labels for orders.status (the raw values the database stores).
// Unknown values fall through unchanged so nothing is ever hidden.
export const ORDER_STATUS_LABEL = {
  awaiting_payment: 'Menunggu Pembayaran',
  pending: 'Mencari Mitra',
  accepted: 'Diterima',
  preparing: 'Disiapkan',
  ready: 'Siap Diambil',
  on_the_way: 'Menuju Lokasi',
  picking_up: 'Menjemput',
  arrived: 'Tiba',
  in_trip: 'Dalam Perjalanan',
  delivering: 'Diantar',
  in_progress: 'Dikerjakan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
};

export const orderStatusLabel = (status) => ORDER_STATUS_LABEL[status] || status;
