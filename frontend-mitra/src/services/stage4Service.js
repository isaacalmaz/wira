// Stage 4 (migrations/0132): scheduled and hourly rides, warranty claims,
// villa special requests. Every write goes through a server function; the
// one direct update (taking a scheduled ride) is verified with .select().

export async function fetchOpenScheduledRides(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, title, details, total_price, rate_code, scheduled_at, metadata, pickup_lat, pickup_lng, distance_meters')
    .eq('service_type', 'ride')
    .eq('status', 'pending')
    .is('driver_id', null)
    .not('scheduled_at', 'is', null)
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function fetchMyScheduledRides(supabaseClient, driverId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, title, details, total_price, rate_code, scheduled_at, metadata, status')
    .eq('service_type', 'ride')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'picking_up', 'in_trip'])
    .not('scheduled_at', 'is', null)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function takeScheduledRide(supabaseClient, orderId, driverId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .update({ status: 'accepted', driver_id: driverId })
    .eq('id', orderId)
    .eq('status', 'pending')
    .is('driver_id', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Jadwal ini sudah diambil sopir lain.');
  return data[0];
}

export async function respondRideExtension(supabaseClient, adjustmentId, approve) {
  const { data, error } = await supabaseClient.rpc('respond_ride_extension', { p_adjustment_id: adjustmentId, p_approve: approve });
  if (error) throw error;
  return data;
}

export async function finishHourlyRide(supabaseClient, orderId) {
  const { data, error } = await supabaseClient.rpc('finish_hourly_ride', { p_order_id: orderId });
  if (error) throw error;
  return data;
}

export async function submitVillaRequestQuote(supabaseClient, orderId, items) {
  const { data, error } = await supabaseClient.rpc('submit_villa_request_quote', { p_order_id: orderId, p_items: items });
  if (error) throw error;
  return data;
}

export async function fetchMyWarrantyClaims(supabaseClient, technicianId) {
  const { data, error } = await supabaseClient
    .from('warranty_claims')
    .select('*')
    .eq('technician_id', technicianId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function respondWarrantyClaim(supabaseClient, claimId, accept, reason = null, photos = []) {
  const { data, error } = await supabaseClient.rpc('respond_warranty_claim', {
    p_claim_id: claimId, p_accept: accept, p_reason: reason, p_photos: photos,
  });
  if (error) throw error;
  return data;
}
