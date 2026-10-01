// Reviews (migrations/0091): only a finished order with a partner, within
// 14 days of finishing, once.
export const REVIEW_WINDOW_DAYS = 14;

export function canReview(order) {
  if (!order || (order.rawStatus || order.status) !== 'completed' || order.is_reviewed) return false;
  if (!order.driver_id && !order.merchant_id) return false;
  const finished = new Date(order.status_changed_at || order.created_at).getTime();
  return Date.now() - finished <= REVIEW_WINDOW_DAYS * 86400000;
}

// Quick tags; the database accepts exactly these codes.
export const POSITIVE_TAGS = ['tepat_waktu', 'rapi', 'ramah', 'harga_sesuai', 'ahli', 'komunikatif'];
export const NEGATIVE_TAGS = ['terlambat', 'kurang_rapi', 'minta_biaya_tambahan', 'tidak_tuntas', 'kurang_sopan'];
