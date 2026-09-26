// Mitra applications (migrations/0084): submitted through the
// submit_mitra_application RPC and stored in public.mitra_applications,
// readable only by the applicant and admins. They used to be one JSON list
// in the public feature_flags row region='mitra_registrations'.

// Legacy path, only used until migration 0084 is applied (PGRST202).
async function submitLegacy(supabase, application) {
  const { data, error: fetchErr } = await supabase
    .from('feature_flags')
    .select('features')
    .eq('region', 'mitra_registrations')
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  const entry = { id: `MTR-${Date.now().toString().slice(-6)}`, ...application, status: 'Pending', created_at: new Date().toISOString() };
  const current = Array.isArray(data?.features) ? data.features : [];
  const updated = [entry, ...current.filter((m) => m.auth_id !== entry.auth_id || m.role !== entry.role)];
  if (data) {
    const { error, data: rows } = await supabase
      .from('feature_flags')
      .update({ features: updated, updated_at: new Date().toISOString() })
      .eq('region', 'mitra_registrations')
      .select('region');
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error('Akses ditolak saat menyimpan pendaftaran.');
  } else {
    const { error } = await supabase
      .from('feature_flags')
      .insert([{ region: 'mitra_registrations', features: updated, updated_at: new Date().toISOString() }]);
    if (error) throw error;
  }
}

// Submits the application, replacing this account's own pending one for the
// same role. authId is only used when there is no session yet (sign-up with
// email confirmation on).
export async function submitMitraApplication(supabase, application, authId) {
  const { error } = await supabase.rpc('submit_mitra_application', {
    p_application: application,
    p_auth_id: authId || null,
  });
  if (error?.code === 'PGRST202') return submitLegacy(supabase, { ...application, auth_id: authId });
  if (error) throw error;
}

// The signed-in user's latest application for one of the given roles, or null.
export async function fetchMyApplication(supabase, userId, roles) {
  const { data, error } = await supabase
    .from('mitra_applications')
    .select('role, vehicle, plate, specialization, experience')
    .eq('auth_id', userId)
    .in('role', roles)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}
