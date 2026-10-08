import { Baby, Car, Home, Package, Utensils, Waves, Wrench } from 'lucide-react';

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

// One icon per service, matching the customer app's service tiles.
export const SERVICE_ICON = {
  ride: Car,
  send: Package,
  food: Utensils,
  villa: Home,
  service: Wrench,
  pool: Waves,
  babysit: Baby,
};

export const serviceIcon = (order) =>
  SERVICE_ICON[order?.service_type] || (order?.merchant_id ? Utensils : Package);
