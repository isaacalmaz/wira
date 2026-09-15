/**
 * orderService.js - Shared mitra order business logic (driver, merchant, technician).
 * Ported from frontend-partner/src/services/partnerOrderService.js as part of
 * consolidating the two mitra apps onto one order-handling implementation.
 */
import { OrderStatus } from '../constants/orderStatus';

const DRIVER_SERVICE_TYPES = ['ride', 'send', 'WiraRide', 'WiraSend'];
const MERCHANT_SERVICE_TYPES = ['food', 'villa', 'WiraFood', 'WiraVilla'];
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];
const FOOD_DELIVERY_SERVICE_TYPES = ['food', 'WiraFood'];

// Ride ('driver' portal) and Send ('courier' portal) split - mirrors the
// Restoran/Villa mitra_access split, but DRIVER_SERVICE_TYPES above (both
// combined) is deliberately kept as the default for any caller that doesn't
// pass an explicit override, so nothing outside frontend-mitra's /driver and
// /courier route roots changes behavior. Exported so DriverHomePage.jsx /
// DriverOrdersPage.jsx / DriverEarningsPage.jsx can scope their queries to
// exactly one of these per basePath instead of importing a hand-copied list.
export const RIDE_SERVICE_TYPES = ['ride', 'WiraRide'];
export const SEND_SERVICE_TYPES = ['send', 'WiraSend'];
export { FOOD_DELIVERY_SERVICE_TYPES };

const NEARBY_RADIUS_METERS = 15000;

/**
 * Haversine distance in meters. Used client-side for the realtime path,
 * where Supabase's postgres_changes filter can't run PostGIS math.
 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
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
 * Food orders never get their own coordinates (merchants have no lat/lng at
 * all - see migrations/0028's header), so they're fetched as a plain,
 * unscoped query and merged in for drivers rather than run through the
 * PostGIS nearby RPC. A food order becomes a "job" the moment the merchant
 * marks it ready, not when the customer first places it - that's still the
 * merchant's own queue via MERCHANT_SERVICE_TYPES.
 */
async function fetchReadyFoodDeliveries(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('status', OrderStatus.READY)
    .in('service_type', FOOD_DELIVERY_SERVICE_TYPES)
    .is('driver_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`fetchReadyFoodDeliveries failed: ${error.message}`);
  return data || [];
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
 *
 * For mode 'driver', ready-for-delivery food orders are always merged in
 * alongside ride/send jobs (see fetchReadyFoodDeliveries above) - this stays
 * true regardless of `serviceTypesOverride` below, so a food-delivery job
 * still reaches both the /driver and /courier portals rather than silently
 * disappearing from one of them the moment the ride/send split ships.
 *
 * `serviceTypesOverride` (optional array) lets a caller narrow mode
 * 'driver''s combined ride+send list to just one of RIDE_SERVICE_TYPES or
 * SEND_SERVICE_TYPES - used by DriverHomePage.jsx to scope the incoming-job
 * queue to whichever of /driver ("Ride") or /courier ("Kurir") it's mounted
 * under. Falls back to the full DRIVER_SERVICE_TYPES (both) when omitted.
 */
export async function fetchPendingOrders(supabaseClient, mode = 'driver', filterId = null, driverPos = null, serviceTypesOverride = null) {
  if ((mode === 'driver' || mode === 'technician') && driverPos?.lat != null && driverPos?.lng != null) {
    const serviceTypes = serviceTypesOverride || (mode === 'driver' ? DRIVER_SERVICE_TYPES : TECHNICIAN_SERVICE_TYPES);
    const { data, error } = await supabaseClient.rpc('get_nearby_pending_orders', {
      driver_lat: driverPos.lat,
      driver_lng: driverPos.lng,
      target_service_types: serviceTypes,
      radius_meters: NEARBY_RADIUS_METERS,
      max_results: 20,
    });
    if (error) throw new Error(`fetchPendingOrders (nearby) failed: ${error.message}`);
    const nearby = data || [];
    if (mode === 'driver') {
      return [...nearby, ...(await fetchReadyFoodDeliveries(supabaseClient))];
    }
    return nearby;
  }

  let query = supabaseClient
    .from('orders')
    .select('*')
    .eq('status', OrderStatus.PENDING)
    .order('created_at', { ascending: false });

  if (mode === 'driver') {
    query = query.in('service_type', serviceTypesOverride || DRIVER_SERVICE_TYPES).is('driver_id', null);
    const { data, error } = await query;
    if (error) throw new Error(`fetchPendingOrders failed: ${error.message}`);
    return [...(data || []), ...(await fetchReadyFoodDeliveries(supabaseClient))];
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
 * Atomically claim a food order that's ready for delivery (merchant has
 * already prepared it). Distinct from acceptOrder: the source status is
 * 'ready', not 'pending', and the destination status is 'picking_up'
 * (heading to the restaurant) rather than 'accepted', since 'accepted' was
 * already consumed earlier in this same order's lifecycle by the merchant.
 */
export async function claimDeliveryOrder(supabaseClient, orderId, driverId) {
  const { data, error } = await supabaseClient
    .from('orders')
    .update({ status: OrderStatus.PICKING_UP, driver_id: driverId })
    .eq('id', orderId)
    .eq('status', OrderStatus.READY)
    .is('driver_id', null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`claimDeliveryOrder failed: order was already claimed or not found (${error ? error.message : 'no rows updated'})`);
  }
  return data;
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
  // COMPLETED intentionally removed: a ready food order must go through a
  // courier now (READY -> PICKING_UP happens via claimDeliveryOrder, not
  // this generic transition check - see migration 0028).
  [OrderStatus.READY]: [OrderStatus.PICKING_UP, OrderStatus.CANCELLED],
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
 * isWithinNearbyRadius. `serviceTypesOverride` (optional) narrows which
 * service types trigger `onOrder` - RIDE_SERVICE_TYPES under /driver,
 * SEND_SERVICE_TYPES under /courier - falling back to the combined
 * DRIVER_SERVICE_TYPES when omitted. The food-ready UPDATE listener below is
 * intentionally NOT scoped by this override (see fetchPendingOrders' doc
 * comment - food delivery stays visible to both portals).
 */
export function subscribeToDriverOrders(supabaseClient, onOrder, getDriverPos = null, serviceTypesOverride = null) {
  const relevantTypes = serviceTypesOverride || DRIVER_SERVICE_TYPES;
  const channel = supabaseClient
    .channel('driver-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        const order = payload.new;
        if (
          order && order.status === OrderStatus.PENDING && !order.driver_id &&
          relevantTypes.includes(order.service_type) &&
          isWithinNearbyRadius(order, getDriverPos)
        ) {
          onOrder(order);
        }
      }
    )
    .on(
      // A food order becomes a driver-visible job on an UPDATE (merchant
      // marking it ready), not an INSERT - it already existed as a
      // merchant-only order before this point.
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        const order = payload.new;
        if (
          order && order.status === OrderStatus.READY && !order.driver_id &&
          FOOD_DELIVERY_SERVICE_TYPES.includes(order.service_type)
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
