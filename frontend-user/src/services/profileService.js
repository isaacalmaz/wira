// Other people's `users` rows are not readable directly any more
// (migrations/0080): the name/phone/vehicle of an order counterparty
// (customer <-> driver/technician, merchant owner -> customer, reviewer ->
// driver) comes from the get_counterparty_profiles RPC instead.
//
// Returns { [userId]: { id, name, phone, vehicle_type } } for the ids the
// caller may see; missing ids are simply absent. Never throws.
export async function fetchCounterpartyProfiles(supabaseClient, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};

  let { data, error } = await supabaseClient.rpc('get_counterparty_profiles', { p_ids: unique });
  if (error?.code === 'PGRST202') {
    // RPC not deployed yet (frontend shipped before migration 0080):
    // the old policy still allows the direct read.
    ({ data, error } = await supabaseClient
      .from('users')
      .select('id, name, phone, vehicle_type')
      .in('id', unique));
  }
  if (error) {
    console.error('fetchCounterpartyProfiles failed:', error);
    return {};
  }
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}
