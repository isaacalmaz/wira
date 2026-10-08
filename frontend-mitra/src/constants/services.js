// One name per service across the partner app (same names the customer app
// and admin panel show). Keyed by orders.service_type.
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
