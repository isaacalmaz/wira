/**
 * orders.js - Shared order utilities for frontend-mitra
 */

/**
 * Checks whether an order is an hourly ride booking.
 * @param {object} order
 * @returns {boolean}
 */
export function isHourlyRide(order) {
  if (!order) return false;
  return (
    order.package_type === 'hourly' ||
    Boolean(order.metadata?.hourly) ||
    Boolean(order.is_hourly) ||
    order.rate_code === 'hourly'
  );
}

/**
 * Unified order address parser that extracts { pickup, dropoff, summary }
 * from an order regardless of whether order.details is:
 *  - A JSON object or JSON string with pickup/dropoff/address
 *  - A plain string like "Jemput: ... -> Tujuan: ..." or "Pengirim: ... | Jemput: ..."
 *  - Direct columns: pickup_address, dropoff_address, address, customer_address, merchant info
 *
 * @param {object} order
 * @returns {{ pickup: string, dropoff: string, summary: string }}
 */
export function parseOrderAddresses(order) {
  if (!order) return { pickup: '', dropoff: '', summary: '' };

  let pickup = '';
  let dropoff = '';
  let parsedDetails = null;

  // 1. Try parsing order.details if it is an object or JSON string
  if (typeof order.details === 'object' && order.details !== null) {
    parsedDetails = order.details;
  } else if (typeof order.details === 'string') {
    const trimmed = order.details.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedDetails = JSON.parse(trimmed);
      } catch {
        parsedDetails = null;
      }
    }
  }

  if (parsedDetails && typeof parsedDetails === 'object' && !Array.isArray(parsedDetails)) {
    // Pickup
    if (typeof parsedDetails.pickup === 'string') {
      pickup = parsedDetails.pickup;
    } else if (parsedDetails.pickup && typeof parsedDetails.pickup === 'object') {
      pickup = parsedDetails.pickup.name || parsedDetails.pickup.address || '';
    } else if (typeof parsedDetails.origin === 'string') {
      pickup = parsedDetails.origin;
    } else if (parsedDetails.origin && typeof parsedDetails.origin === 'object') {
      pickup = parsedDetails.origin.name || parsedDetails.origin.address || '';
    }

    // Dropoff
    if (typeof parsedDetails.dropoff === 'string') {
      dropoff = parsedDetails.dropoff;
    } else if (parsedDetails.dropoff && typeof parsedDetails.dropoff === 'object') {
      dropoff = parsedDetails.dropoff.name || parsedDetails.dropoff.address || '';
    } else if (typeof parsedDetails.destination === 'string') {
      dropoff = parsedDetails.destination;
    } else if (parsedDetails.destination && typeof parsedDetails.destination === 'object') {
      dropoff = parsedDetails.destination.name || parsedDetails.destination.address || '';
    }

    // Single address property
    if (!pickup && parsedDetails.address) {
      pickup = typeof parsedDetails.address === 'string'
        ? parsedDetails.address
        : (parsedDetails.address.name || parsedDetails.address.address || '');
    }
  }

  // 2. If details is a plain string (not JSON) with pattern like "Jemput: ... -> Tujuan: ..."
  if ((!pickup || !dropoff) && typeof order.details === 'string' && !parsedDetails) {
    const str = order.details;

    // Pattern: "Jemput: X -> Tujuan: Y" or "Jemput: X → Tujuan: Y" or "Jemput: X -> Y"
    const arrowMatch = str.match(/Jemput:\s*([^→\->|]+?)(?:\s*(?:→|->|Tujuan:)\s*([^|]+))?$/i);
    if (arrowMatch) {
      if (!pickup && arrowMatch[1]) pickup = arrowMatch[1].trim();
      if (!dropoff && arrowMatch[2]) dropoff = arrowMatch[2].trim();
    }

    // Pattern: "Pengirim: ... | Jemput: ... | Penerima: ... | Tujuan: ..."
    if (!pickup) {
      const pMatch = str.match(/Jemput:\s*([^|→\->]+)/i);
      if (pMatch) pickup = pMatch[1].trim();
    }
    if (!dropoff) {
      const dMatch = str.match(/(?:Tujuan|Antar):\s*([^|]+)/i);
      if (dMatch) dropoff = dMatch[1].trim();
    }

    // Generic "X -> Y" or "X → Y"
    if (!pickup && !dropoff && (str.includes(' -> ') || str.includes(' → '))) {
      const parts = str.split(/\s*(?:->|→)\s*/);
      if (parts.length >= 2) {
        pickup = parts[0].replace(/^Jemput:\s*/i, '').trim();
        dropoff = parts[1].replace(/^(?:Tujuan|Antar):\s*/i, '').trim();
      }
    }
  }

  // 3. Fallbacks from order columns
  if (!pickup) {
    pickup = (
      order.pickup_address ||
      order.pickup_location ||
      order.address ||
      order.customer_address ||
      order.merchant?.name ||
      ''
    );
  }

  if (!dropoff) {
    dropoff = (
      order.dropoff_address ||
      order.dropoff_location ||
      order.customer_address ||
      order.destination_address ||
      ''
    );
  }

  // Special case: food order pickup is the merchant
  if (!pickup && (order.service_type === 'food' || order.type === 'food')) {
    pickup = order.merchant?.name
      ? `${order.merchant.name}${order.merchant.address ? ` (${order.merchant.address})` : ''}`
      : 'Restoran';
  }

  // Summary
  const summary = (pickup && dropoff)
    ? `${pickup} → ${dropoff}`
    : (dropoff || pickup || order.title || order.address || '');

  return { pickup, dropoff, summary };
}
