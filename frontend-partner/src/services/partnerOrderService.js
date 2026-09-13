/**
 * partnerOrderService.js - Shared Partner Order Business Logic
 * Used by both the React UI components and the E2E test runner.
 */

export const OrderStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Fetch pending orders matching partner mode and service types
 */
export async function fetchPendingOrders(supabaseClient, mode = 'driver', filterId = null) {
  let query = supabaseClient
    .from('orders')
    .select('*')
    .eq('status', OrderStatus.PENDING)
    .order('created_at', { ascending: false });

  if (mode === 'driver') {
    query = query.in('service_type', ['ride', 'send', 'WiraRide', 'WiraSend']).is('driver_id', null);
  } else if (mode === 'merchant' && filterId) {
    query = query.in('service_type', ['food', 'villa', 'WiraFood', 'WiraVilla']).eq('merchant_id', filterId);
  } else if (mode === 'merchant') {
    query = query.in('service_type', ['food', 'villa', 'WiraFood', 'WiraVilla']);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchPendingOrders failed: ${error.message}`);
  return data || [];
}

/**
 * Fetch a single order by ID
 */
export async function getOrderById(supabaseClient, orderId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error) throw new Error(`getOrderById failed: ${error.message}`);
  return data;
}

/**
 * Accept an incoming order
 */
export async function acceptOrder(supabaseClient, orderId, partnerId, mode = 'driver') {
  const updates = {
    status: OrderStatus.ACCEPTED
  };

  if (mode === 'driver' && partnerId) {
    updates.driver_id = partnerId;
  }

  const { data, error } = await supabaseClient
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new Error(`acceptOrder failed: ${error.message}`);
  return data;
}

/**
 * Update order status (preparing, ready, etc.)
 */
export async function updateOrderStatus(supabaseClient, orderId, nextStatus) {
  const { data, error } = await supabaseClient
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new Error(`updateOrderStatus failed: ${error.message}`);
  return data;
}

/**
 * Complete an order
 */
export async function completeOrder(supabaseClient, orderId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .update({ status: OrderStatus.COMPLETED })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw new Error(`completeOrder failed: ${error.message}`);
  return data;
}
