/**
 * orderService.js - Shared mitra order business logic (driver, merchant, technician).
 * Ported from frontend-partner/src/services/partnerOrderService.js as part of
 * consolidating the two mitra apps onto one order-handling implementation.
 */
import { OrderStatus } from '../constants/orderStatus';

const DRIVER_SERVICE_TYPES = ['ride', 'send', 'WiraRide', 'WiraSend'];
const MERCHANT_SERVICE_TYPES = ['food', 'villa', 'WiraFood', 'WiraVilla'];
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];

const NEARBY_RADIUS_METERS = 15000;

/**
 * Haversine distance in meters. Used client-side for the realtime path,
 * where Supabase's postgres_changes filter can't run PostGIS math.
 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch pending orders matching a mitra mode and service types.
 *
 * `driverPos` ({lat, lng}), when given for mode 'driver'/'technician', scopes
 * the result to orders within NEARBY_RADIUS_METERS via the get_nearby_pending_orders
 * RPC - orders with no pickup coordinates yet (send/service/pool) are still
 * always included (see migration 0018 for why). Without driverPos (GPS not
 * yet available), falls back to the old unscoped query so mitra aren't left
 * with an empty list while location is still resolving.
 */
export async function fetchPendingOrders(supabaseClient, mode = 'driver', filterId = null, driverPos = null) {
  if ((mode === 'driver' || mode === 'technician') && driverPos?.lat != null && driverPos?.lng != null) {
    const serviceTypes = mode === 'driver' ? DRIVER_SERVICE_TYPES : TECHNICIAN_SERVICE_TYPES;
    const { data, error } = await supabaseClient.rpc('get_nearby_pending_orders', {
      driver_lat: driverPos.lat,
      driver_lng: driverPos.lng,
      target_service_types: serviceTypes,
      radius_meters: NEARBY_RADIUS_METERS,
      max_results: 20,
    });
    if (error) throw new Error(`fetchPendingOrders (nearby) failed: ${error.message}`);
    return data || [];
  }

  let query = supabaseClient
    .from('orders')
    .select('*')
    .eq('status', OrderStatus.PENDING)
    .order('created_at', { ascending: false });

  if (mode === 'driver') {
    query = query.in('service_type', DRIVER_SERVICE_TYPES).is('driver_id', null);
  } else if (mode === 'technician') {
    query = query.in('service_type', TECHNICIAN_SERVICE_TYPES).is('driver_id', null);
  } else if (mode === 'merchant' && filterId) {
    query = query.in('service_type', MERCHANT_SERVICE_TYPES).eq('merchant_id', filterId);
  } else if (mode === 'merchant') {
    query = query.in('service_type', MERCHANT_SERVICE_TYPES);
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
 * Atomically accept an incoming order. Uses a conditional update (status must
 * still be pending, and for driver/technician modes driver_id must still be
 * null) so two mitra accepting the same order at once can't both succeed.
 */
export async function acceptOrder(supabaseClient, orderId, partnerId, mode = 'driver') {
  const assignsDriverId = mode === 'driver' || mode === 'technician';

  let query = supabaseClient
    .from('orders')
    .update({
      status: OrderStatus.ACCEPTED,
      driver_id: assignsDriverId ? partnerId : null
    })
    .eq('id', orderId)
    .eq('status', OrderStatus.PENDING);

  if (assignsDriverId) {
    query = query.is('driver_id', null);
  }

  const { data, error } = await query.select().single();
  if (error || !data) {
    throw new Error(`acceptOrder failed: order was already accepted, cancelled, or not found (${error ? error.message : 'no rows updated'})`);
  }
  return data;
}

const VALID_TRANSITIONS = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PICKING_UP, OrderStatus.PREPARING, OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED, OrderStatus.COMPLETED],
  [OrderStatus.PICKING_UP]: [OrderStatus.IN_TRIP, OrderStatus.CANCELLED],
  [OrderStatus.IN_TRIP]: [OrderStatus.COMPLETED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.WORKING, OrderStatus.CANCELLED],
  [OrderStatus.WORKING]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: []
};

/**
 * Update order status (preparing, ready, picking_up, in_trip, on_the_way,
 * working, etc.), enforcing the canonical transition graph.
 */
export async function updateOrderStatus(supabaseClient, orderId, nextStatus) {
  const currentOrder = await getOrderById(supabaseClient, orderId);
  if (!currentOrder) throw new Error(`Order ${orderId} not found`);

  const allowed = VALID_TRANSITIONS[currentOrder.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid status transition: Cannot transition order ${orderId} from '${currentOrder.status}' to '${nextStatus}'`);
  }

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
 * Update driver/technician location (lat/lng)
 */
export async function updateDriverLocation(supabaseClient, driverId, lat, lng) {
  if (lat === null || lng === null || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    throw new Error(`Invalid GPS coordinates: [${lat}, ${lng}]. Refusing to update location.`);
  }

  const { error } = await supabaseClient
    .from('drivers')
    .upsert({
      id: driverId,
      lat,
      lng,
      is_online: true,
      updated_at: new Date().toISOString()
    });

  if (error) throw new Error(`updateDriverLocation failed: ${error.message}`);
}

/**
 * Mark a driver/technician offline (nothing else writes is_online=false, so
 * without this every driver who has ever gone online stays "online" forever
 * in public.drivers regardless of what the app UI shows).
 */
export async function setDriverOffline(supabaseClient, driverId) {
  const { error, data } = await supabaseClient
    .from('drivers')
    .update({ is_online: false, updated_at: new Date().toISOString() })
    .eq('id', driverId)
    .select();

  if (error) throw new Error(`setDriverOffline failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error('setDriverOffline: no matching driver row (RLS denied or not found)');
}

/**
 * Complete an order
 */
export async function completeOrder(supabaseClient, orderId) {
  return updateOrderStatus(supabaseClient, orderId, OrderStatus.COMPLETED);
}

/**
 * Realtime INSERT payloads can't be filtered by distance server-side
 * (postgres_changes only supports simple column=eq.value filters), so this
 * checks it client-side. `getDriverPos` is called fresh on every event (not
 * captured once) so it always reflects the driver's latest known position.
 * Orders with no pickup coordinates, or when the driver's position isn't
 * known yet, are always passed through (see migration 0018's rationale).
 */
function isWithinNearbyRadius(order, getDriverPos) {
  if (!getDriverPos) return true;
  const pos = getDriverPos();
  if (!pos || pos.lat == null || pos.lng == null) return true;
  if (order.pickup_lat == null || order.pickup_lng == null) return true;
  return distanceMeters(pos.lat, pos.lng, order.pickup_lat, order.pickup_lng) <= NEARBY_RADIUS_METERS;
}

/**
 * Subscribe to realtime pending driver orders. `getDriverPos` (optional) is
 * a `() => {lat, lng} | null` used to filter out-of-radius orders - see
 * isWithinNearbyRadius.
 */
export function subscribeToDriverOrders(supabaseClient, onOrder, getDriverPos = null) {
  const channel = supabaseClient
    .channel('driver-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        const order = payload.new;
        if (
          order && order.status === OrderStatus.PENDING && !order.driver_id &&
          DRIVER_SERVICE_TYPES.includes(order.service_type) &&
          isWithinNearbyRadius(order, getDriverPos)
        ) {
          onOrder(order);
        }
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}

/**
 * Subscribe to realtime pending technician jobs
 */
export function subscribeToTechnicianOrders(supabaseClient, onOrder) {
  const channel = supabaseClient
    .channel('technician-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        const order = payload.new;
        if (order && order.status === OrderStatus.PENDING && !order.driver_id && TECHNICIAN_SERVICE_TYPES.includes(order.service_type)) {
          onOrder(order);
        }
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}

/**
 * Subscribe to realtime merchant orders
 */
export function subscribeToMerchantOrders(supabaseClient, merchantId, onOrder) {
  const channel = supabaseClient
    .channel(`merchant-orders-${merchantId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter: `merchant_id=eq.${merchantId}` },
      (payload) => {
        const order = payload.new;
        if (order && order.status === OrderStatus.PENDING) {
          onOrder(order);
        }
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}

/**
 * Subscribe to realtime updates for a specific order
 */
export function subscribeToOrderUpdates(supabaseClient, orderId, onUpdate) {
  const channel = supabaseClient
    .channel(`order-track-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      (payload) => {
        if (payload.new) onUpdate(payload.new);
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}
