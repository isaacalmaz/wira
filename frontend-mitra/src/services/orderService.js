/**
 * orderService.js - Shared mitra order business logic (driver, merchant, technician).
 * Ported from frontend-partner/src/services/partnerOrderService.js as part of
 * consolidating the two mitra apps onto one order-handling implementation.
 */
import { OrderStatus } from '../constants/orderStatus';

const MERCHANT_SERVICE_TYPES = ['food', 'villa', 'WiraFood', 'WiraVilla'];
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];
const FOOD_DELIVERY_SERVICE_TYPES = ['food', 'WiraFood'];
const RIDE_SERVICE_TYPES = ['ride', 'WiraRide'];
const SEND_SERVICE_TYPES = ['send', 'WiraSend'];
export { FOOD_DELIVERY_SERVICE_TYPES };

const NEARBY_RADIUS_METERS = 15000;

// A driver's job_type_preferences entries map onto these real orders.service_type
// values - the one place this mapping is defined (see eligibleServiceTypesForDriver).
const JOB_TYPE_SERVICE_TYPES = {
  ride: RIDE_SERVICE_TYPES,
  send: SEND_SERVICE_TYPES,
  food: FOOD_DELIVERY_SERVICE_TYPES,
};

// mobil drivers may only receive Send jobs whose package is one of these tiers.
const SEND_LARGE_PACKAGE_SIZES = ['sedang', 'besar'];

/**
 * ============================================================================
 * OPTION B - THE single JS implementation of driver job-type eligibility.
 * ============================================================================
 * Every call site that needs to know "which orders can this driver receive"
 * (fetchPendingOrders' nearby-RPC path, its unscoped-fallback path, and
 * subscribeToDriverOrders' realtime path) goes through this function (or
 * isOrderEligibleForDriver below, which is built on top of it) rather than
 * re-deriving the rule locally - this was a deliberate choice to avoid the
 * exact rule-drift bug class (a rule changed in one place, missed in
 * another) that bit this codebase earlier tonight. The SQL side has exactly
 * one mirroring implementation: is_order_eligible_for_driver() in migration
 * 0033 - keep the two in sync if this rule ever changes.
 *
 * Rule:
 *   - motor: eligible for whatever's in job_type_preferences (ride/send/food,
 *     any combination), unrestricted.
 *   - mobil: eligible for whatever's in job_type_preferences, EXCEPT:
 *       - 'food' is filtered out unconditionally, even if it's somehow
 *         present in the stored preferences (defense in depth against a bug
 *         or manual DB edit) - food is a hard, permanent restriction for
 *         mobil, never a toggle.
 *       - 'send' is additionally restricted to large packages only - see
 *         sendPackageSizes below, applied by the caller against an order's
 *         actual package_size (this function alone can't decide that; it
 *         only knows which service_type values are eligible AT ALL).
 *
 * `driver` is a driver-shaped object with `vehicle_type` ('motor'/'mobil')
 * and `job_type_preferences` (array of 'ride'/'send'/'food'). Missing/null
 * fields default to the least-privileged-but-backward-compatible reading:
 * vehicle_type defaults to 'motor', job_type_preferences defaults to [].
 *
 * Returns { serviceTypes, sendPackageSizes }:
 *   - serviceTypes: the real orders.service_type values this driver may
 *     receive at all (before any package_size check).
 *   - sendPackageSizes: null (no restriction) or an array of package_size
 *     values - when non-null, an order whose service_type is a Send type is
 *     eligible only if its package_size is in this array.
 */
export function eligibleServiceTypesForDriver(driver) {
  const prefs = Array.isArray(driver?.job_type_preferences) ? driver.job_type_preferences : [];
  const vehicleType = driver?.vehicle_type || 'motor';
  const isMobil = vehicleType === 'mobil';

  const allowedJobTypes = prefs.filter((jobType) => JOB_TYPE_SERVICE_TYPES[jobType] && !(isMobil && jobType === 'food'));
  const serviceTypes = allowedJobTypes.flatMap((jobType) => JOB_TYPE_SERVICE_TYPES[jobType]);

  return {
    serviceTypes,
    sendPackageSizes: isMobil ? SEND_LARGE_PACKAGE_SIZES : null,
  };
}

/**
 * Full eligibility check for one concrete order (service_type AND, for Send
 * orders, package_size) - used by the realtime subscription path, where a
 * single order payload needs a yes/no answer rather than a list of allowed
 * types. Built directly on eligibleServiceTypesForDriver so the two can
 * never disagree.
 */
export function isOrderEligibleForDriver(order, driver) {
  if (!order) return false;
  const { serviceTypes, sendPackageSizes } = eligibleServiceTypesForDriver(driver);
  if (!serviceTypes.includes(order.service_type)) return false;
  if (sendPackageSizes && SEND_SERVICE_TYPES.includes(order.service_type)) {
    return sendPackageSizes.includes(order.package_size);
  }
  return true;
}

/**
 * Applies an eligibility result (from eligibleServiceTypesForDriver) to a
 * Supabase query builder. Needed because the package_size restriction only
 * applies to Send orders - a plain `.in('service_type', serviceTypes)` can't
 * express "this type unconditionally, that type only when package_size is
 * also in this other list", so when sendPackageSizes is set this builds a
 * PostgREST `.or()` clause instead.
 */
function applyEligibilityFilter(query, eligibility) {
  const { serviceTypes, sendPackageSizes } = eligibility;
  if (serviceTypes.length === 0) {
    // No eligible types at all - match nothing rather than falling through
    // to an unfiltered query.
    return query.in('service_type', ['__none_eligible__']);
  }
  if (!sendPackageSizes) {
    return query.in('service_type', serviceTypes);
  }
  const sendTypes = serviceTypes.filter((t) => SEND_SERVICE_TYPES.includes(t));
  const otherTypes = serviceTypes.filter((t) => !SEND_SERVICE_TYPES.includes(t));
  const orParts = [];
  if (otherTypes.length) orParts.push(`service_type.in.(${otherTypes.join(',')})`);
  if (sendTypes.length) orParts.push(`and(service_type.in.(${sendTypes.join(',')}),package_size.in.(${sendPackageSizes.join(',')}))`);
  if (orParts.length === 0) return query.in('service_type', ['__none_eligible__']);
  return query.or(orParts.join(','));
}

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
 * `driver` (mode 'driver' only) is the logged-in driver's own {vehicle_type,
 * job_type_preferences} - passed through eligibleServiceTypesForDriver (see
 * its doc comment for the full rule) to decide which service types, and for
 * Send orders which package sizes, this driver may receive. Ready-for-
 * delivery food orders (fetchReadyFoodDeliveries) are only merged in when
 * 'food' is actually part of this driver's eligible service types - a driver
 * who has toggled Antar Makanan off, or a mobil driver (food is never
 * eligible for mobil, see eligibleServiceTypesForDriver), stops seeing them.
 */
export async function fetchPendingOrders(supabaseClient, mode = 'driver', filterId = null, driverPos = null, driver = null) {
  if (mode === 'driver') {
    const eligibility = eligibleServiceTypesForDriver(driver);
    const canReceiveFood = eligibility.serviceTypes.some((t) => FOOD_DELIVERY_SERVICE_TYPES.includes(t));

    if (driverPos?.lat != null && driverPos?.lng != null) {
      const { data, error } = await supabaseClient.rpc('get_nearby_pending_orders', {
        driver_lat: driverPos.lat,
        driver_lng: driverPos.lng,
        target_service_types: null,
        radius_meters: NEARBY_RADIUS_METERS,
        max_results: 20,
        driver_vehicle_type: driver?.vehicle_type || 'motor',
        driver_job_type_preferences: driver?.job_type_preferences || [],
      });
      if (error) throw new Error(`fetchPendingOrders (nearby) failed: ${error.message}`);
      const nearby = data || [];
      return canReceiveFood ? [...nearby, ...(await fetchReadyFoodDeliveries(supabaseClient))] : nearby;
    }

    let driverQuery = supabaseClient
      .from('orders')
      .select('*')
      .eq('status', OrderStatus.PENDING)
      .is('driver_id', null)
      .order('created_at', { ascending: false });
    driverQuery = applyEligibilityFilter(driverQuery, eligibility);
    const { data, error } = await driverQuery;
    if (error) throw new Error(`fetchPendingOrders failed: ${error.message}`);
    return canReceiveFood ? [...(data || []), ...(await fetchReadyFoodDeliveries(supabaseClient))] : (data || []);
  }

  if (mode === 'technician' && driverPos?.lat != null && driverPos?.lng != null) {
    const { data, error } = await supabaseClient.rpc('get_nearby_pending_orders', {
      driver_lat: driverPos.lat,
      driver_lng: driverPos.lng,
      target_service_types: TECHNICIAN_SERVICE_TYPES,
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

  if (mode === 'technician') {
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
 *
 * `partnerId` (the current logged-in mitra's own id) and `mode` are
 * REQUIRED, not just for bookkeeping - they scope the actual UPDATE to rows
 * this mitra owns, the same ownership-guard pattern acceptOrder/
 * claimDeliveryOrder already use elsewhere in this file. Drivers and
 * technicians are both stored under orders.driver_id (see
 * TechOrdersPage.jsx's fetchOrders, which queries driver_id for a
 * technician's own jobs too), so mode 'driver'/'technician' both filter on
 * driver_id; mode 'merchant' filters on merchant_id. Without this, any
 * logged-in mitra account could transition an order it doesn't own just by
 * knowing/guessing its id - this is defense-in-depth (final enforcement
 * should also live in Postgres RLS), not a replacement for it.
 */
export async function updateOrderStatus(supabaseClient, orderId, nextStatus, partnerId, mode = 'driver') {
  if (!partnerId) {
    throw new Error('updateOrderStatus requires the current mitra\'s own id (partnerId) to scope the update to orders they own.');
  }

  const currentOrder = await getOrderById(supabaseClient, orderId);
  if (!currentOrder) throw new Error(`Order ${orderId} not found`);

  const allowed = VALID_TRANSITIONS[currentOrder.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid status transition: Cannot transition order ${orderId} from '${currentOrder.status}' to '${nextStatus}'`);
  }

  const ownsViaDriverId = mode === 'driver' || mode === 'technician';
  let query = supabaseClient
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', orderId);
  query = ownsViaDriverId ? query.eq('driver_id', partnerId) : query.eq('merchant_id', partnerId);

  const { data, error } = await query.select().single();

  if (error || !data) {
    throw new Error(`updateOrderStatus failed: order not found or not owned by this account (${error ? error.message : 'no rows updated'})`);
  }
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
export async function completeOrder(supabaseClient, orderId, partnerId, mode = 'driver') {
  return updateOrderStatus(supabaseClient, orderId, OrderStatus.COMPLETED, partnerId, mode);
}

/**
 * These mirror migrations/0028_mitra_payout_system.sql's
 * credit_payout_on_order_completed trigger EXACTLY (20% platform commission,
 * i.e. mitra keep 80%) - keep them in sync if that trigger's math ever
 * changes. Earnings screens across the mitra app must show what the trigger
 * actually credited, not raw order.total_price (which double-counts: for a
 * food order, total_price is the whole meal+delivery bill, but the merchant
 * only ever earns the food portion and the driver only the delivery-fee
 * portion of it - summing full total_price for both would imply the
 * platform paid out more than the customer paid).
 */
export function driverEarnedAmount(order) {
  if (order.merchant_id) return (order.delivery_fee || 0) * 0.8; // food: driver earns the delivery fee only
  return (order.total_price || 0) * 0.8; // ride/send/service/pool: driver earns the whole thing
}

export function merchantEarnedAmount(order) {
  return Math.max((order.total_price || 0) - (order.delivery_fee || 0), 0) * 0.8;
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
 * Builds a Realtime `filter` string that narrows a postgres_changes
 * subscription to "unassigned orders (driver_id IS NULL) whose service_type
 * is one this mitra could ever care about". Supabase Realtime's filter
 * option is AND-only (no OR across columns - see Supabase's Aug 2026
 * "Postgres Changes gets AND filters" release, which is what makes the
 * `is.null` + `in.()` combination below possible at all; confirmed live
 * against this project's own Supabase Cloud instance, not just docs), so
 * this can't also narrow to "OR this row is already assigned to me" in the
 * same clause - every event subscribeToDriverOrders/subscribeToTechnicianOrders
 * actually react to below only ever fires for driver_id IS NULL rows anyway
 * (new pending orders, a food order going READY, a requeued ride/send), so
 * that's not a gap in practice for this function. If `serviceTypes` is
 * empty (this mitra is eligible for nothing right now), the filter is built
 * to match no real row rather than omitting the filter and falling back to
 * platform-wide broadcast.
 */
function buildUnassignedServiceTypeFilter(serviceTypes) {
  const types = serviceTypes.length ? serviceTypes : ['__none_eligible__'];
  return `driver_id=is.null,service_type=in.(${types.join(',')})`;
}

/**
 * Subscribe to realtime pending driver orders. `getDriverPos` (optional) is
 * a `() => {lat, lng} | null` used to filter out-of-radius orders - see
 * isWithinNearbyRadius. `driver` (the logged-in driver's own {vehicle_type,
 * job_type_preferences}) is run through isOrderEligibleForDriver - the same
 * Option B eligibility function fetchPendingOrders uses - for every branch
 * below, so a driver who has toggled a job type off, or a mobil driver
 * food/small-package-send is never eligible for, never sees it appear here
 * either. It's ALSO now used to build a server-side Realtime `filter` (see
 * buildUnassignedServiceTypeFilter) so this driver's client no longer
 * receives the full row (customer id, price, pickup coordinates, package
 * info) for every order placed platform-wide - only for unassigned orders
 * whose service_type this driver could possibly be eligible for. The
 * client-side isOrderEligibleForDriver/isWithinNearbyRadius checks below
 * stay in place unchanged: geo radius and the Send package-size rule still
 * can't be expressed in a Realtime filter, and they're cheap defense-in-depth
 * against the filter ever being wrong.
 */
export function subscribeToDriverOrders(supabaseClient, onOrder, getDriverPos = null, driver = null) {
  const { serviceTypes } = eligibleServiceTypesForDriver(driver);
  const filter = buildUnassignedServiceTypeFilter(serviceTypes);

  const channel = supabaseClient
    .channel('driver-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter },
      (payload) => {
        const order = payload.new;
        if (
          order && order.status === OrderStatus.PENDING && !order.driver_id &&
          isOrderEligibleForDriver(order, driver) &&
          isWithinNearbyRadius(order, getDriverPos)
        ) {
          onOrder(order);
        }
      }
    )
    .on(
      // Two distinct "this order just became visible again" cases share one
      // UPDATE listener, since both are an existing row changing, never a
      // new INSERT: (1) a food order the merchant just marked ready
      // (READY, unchanged from before), and (2) a ride/send order whose
      // driver just cancelled - wallet_refund_matched_ride's driver branch
      // (migrations/0048_driver_cancel_requeues_ride.sql) resets it to
      // PENDING/driver_id=NULL instead of CANCELLED, specifically so it
      // reaches this same eligibility/matching machinery a second time.
      // Without this, only the 10s polling fallback (checkPendingOrders in
      // DriverHomePage.jsx) would ever pick up case (2) - confirmed by
      // reading this subscription before this migration: it only had an
      // INSERT listener plus this narrower READY-only UPDATE listener,
      // neither of which would have matched a same-row PENDING update.
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter },
      (payload) => {
        const order = payload.new;
        if (!order || order.driver_id) return;

        const isReadyFoodDelivery =
          order.status === OrderStatus.READY &&
          FOOD_DELIVERY_SERVICE_TYPES.includes(order.service_type);
        if (isReadyFoodDelivery && isOrderEligibleForDriver(order, driver)) {
          onOrder(order);
          return;
        }

        const isRequeuedRideOrSend =
          order.status === OrderStatus.PENDING &&
          (RIDE_SERVICE_TYPES.includes(order.service_type) || SEND_SERVICE_TYPES.includes(order.service_type));
        if (
          isRequeuedRideOrSend &&
          isOrderEligibleForDriver(order, driver) &&
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
 * Subscribe to realtime pending technician jobs. Narrowed with the same
 * driver_id-IS-NULL + service_type-IN Realtime filter as
 * subscribeToDriverOrders (see buildUnassignedServiceTypeFilter) - a
 * technician's eligible set is the static TECHNICIAN_SERVICE_TYPES list
 * (service/pool jobs are unfiltered by specialization on purpose, see
 * TechOrdersPage.jsx's isPoolOrder comment), so there's no per-technician
 * eligibility to compute here, just this fixed list.
 */
export function subscribeToTechnicianOrders(supabaseClient, onOrder) {
  const filter = buildUnassignedServiceTypeFilter(TECHNICIAN_SERVICE_TYPES);
  const channel = supabaseClient
    .channel('technician-orders-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter },
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
