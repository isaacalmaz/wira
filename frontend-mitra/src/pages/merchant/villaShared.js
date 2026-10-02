// Shared bits for the villa host pages (Properti Saya + edit form).

export const AMENITY_PRESETS = [
  'Wifi', 'Kolam renang', 'AC', 'Dapur', 'Parkir', 'Sarapan', 'Pemandangan laut',
  'Air panas', 'TV', 'Mesin cuci', 'BBQ', 'Antar-jemput bandara',
];

export const MAX_PHOTOS = 12;

/** Status a host sees for one property (migration 0097). */
export function listingState(m) {
  if (m.listing_status === 'pending') return { tone: 'warning', label: 'Menunggu peninjauan' };
  if (m.listing_status === 'rejected') return { tone: 'danger', label: 'Perlu diperbaiki' };
  if (m.is_open === false) return { tone: 'neutral', label: 'Dijeda' };
  return { tone: 'success', label: 'Tayang' };
}
