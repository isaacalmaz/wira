import { prettySchedule } from './datetime';

export const parseOrderDetails = (detailsStr) => {
  if (!detailsStr) return '';
  try {
    const parsed = JSON.parse(detailsStr);
    if (Array.isArray(parsed)) {
      return parsed.map(item => `${item.quantity || 1}x ${item.name || 'Item'}`).join(', ');
    } else if (parsed.pickup && parsed.dropoff) {
      return `${parsed.pickup.name || 'Lokasi Jemput'} ➔ ${parsed.dropoff.name || 'Tujuan'}`;
    }
    return prettySchedule(detailsStr);
  } catch (e) {
    return prettySchedule(detailsStr);
  }
};

// "Rp 40.000" / "-Rp 10.000". payable_balance and per-order earnings can be
// negative since migrations/0075 (cash orders owe the platform commission).
export const formatSignedRupiah = (value) => {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? '-' : ''}Rp ${Math.abs(n).toLocaleString('id-ID')}`;
};
