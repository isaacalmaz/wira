export const parseOrderDetails = (detailsStr) => {
  if (!detailsStr) return '';
  try {
    const parsed = JSON.parse(detailsStr);
    if (Array.isArray(parsed)) {
      return parsed.map(item => `${item.quantity || 1}x ${item.name || 'Item'}`).join(', ');
    } else if (parsed.pickup && parsed.dropoff) {
      return `${parsed.pickup.name || 'Lokasi Jemput'} ➔ ${parsed.dropoff.name || 'Tujuan'}`;
    }
    return detailsStr; 
  } catch (e) {
    return detailsStr;
  }
};
