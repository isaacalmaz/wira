import { supabase } from '../config/supabase';

/**
 * Restaurant and villa registrations (mitra_applications role 'merchant' /
 * 'villa') are approved the same way; MerchantsPage handles restaurants,
 * VillasPage handles villas.
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

export const isVillaApplication = (a) => a.service_type === 'villa' || a.service_type === 'WiraVilla';

/** Grants portal access and creates the merchants row for an accepted application. */
export async function approveMerchantApplication(pending) {
  // public.users must exist BEFORE merchants (merchants.owner_id has
  // a foreign key to users.id) - this used to insert merchants first,
  // which threw a foreign-key violation for every brand-new
  // registrant (no existing users row yet, the normal case for a
  // first-time mitra signup). Because feature_flags status was
  // updated to 'Active' separately with no rollback on failure, the
  // registration looked "approved" in the queue while no merchants
  // row and no mitra_access grant ever actually happened.
  if (pending.auth_id) {
    const { data: userProfile, error: profileErr } = await supabase.from('users').select('*').eq('id', pending.auth_id).maybeSingle();
    if (profileErr) throw profileErr;

    // Villa is now its own login portal, separate from merchant
    // (Restoran) - grant the matching mitra_access value so the
    // account actually lands in the right portal.
    const grantRole = isVillaApplication(pending) ? 'villa' : 'merchant';
    let currentAccess = userProfile?.mitra_access || [];
    if (!currentAccess.includes(grantRole)) currentAccess.push(grantRole);

    if (userProfile) {
      const { error: updateErr, data: updatedUser } = await supabase.from('users').update({
        mitra_access: currentAccess,
        status: 'Aktif'
      }).eq('id', pending.auth_id).select();
      if (updateErr) throw updateErr;
      if (!updatedUser || updatedUser.length === 0) {
        throw new Error("Gagal! Akses ditolak oleh sistem keamanan RLS Supabase.");
      }
    } else {
      const { error: insertErr } = await supabase.from('users').insert([{
        id: pending.auth_id,
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        role: 'mitra',
        status: 'Aktif',
        mitra_access: currentAccess
      }]);
      if (insertErr) throw insertErr;
    }
  }

  const { error: insertMerchantErr } = await supabase.from('merchants').insert([{
    owner_id: pending.auth_id || null,
    name: pending.name,
    service_type: pending.service_type || 'food',
    address: pending.address,
    // Villas get their photos from the host's own gallery (migration 0097).
    image: isVillaApplication(pending) ? null : 'https://via.placeholder.com/150',
  }]);
  if (insertMerchantErr) throw insertMerchantErr;

}
