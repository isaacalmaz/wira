// One name per service across the admin panel (same names the customer and
// partner apps show). Keyed by orders.service_type.
export const SERVICE_LABEL = {
  ride: 'WiraRide',
  send: 'WiraSend',
  food: 'WiraFood',
  villa: 'WiraVilla',
  service: 'WiraService',
  pool: 'WiraPool',
  babysit: 'WiraAsuh',
};

export const serviceLabel = (type) => SERVICE_LABEL[type] || type || '-';
