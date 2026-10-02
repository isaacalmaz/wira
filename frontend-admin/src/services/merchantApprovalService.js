/**
 * Restaurant and villa registrations (mitra_applications role 'merchant' /
 * 'villa') shaped for MitraReviewModal. Approval itself is
 * reviewApplication (admin_review_application, migrations/0101).
 */
export const toMerchantApplication = (m) => ({
  id: m.id,
  auth_id: m.auth_id,
  role: 'merchant',
  name: m.restaurant_name || m.name,
  owner: m.name,
  phone: m.phone,
  email: m.email,
  address: m.address || 'Mataram, Lombok',
  service_type: m.service_type || (m.role === 'villa' ? 'villa' : 'food'),
  sim_photo: m.sim_photo,
  ktp_photo: m.ktp_photo,
  selfie_photo: m.selfie_photo,
  vehicle_plate: m.vehicle_plate,
  vehicle_type: m.vehicle_type,
  status: m.status,
  date: m.created_at,
});

