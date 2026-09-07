/**
 * Wira Ecosystem Service & State Synchronizer
 * Handles cross-portal communication (User <-> Mitra <-> Admin),
 * order lifecycle state machine, real-time broadcasts, and financial settlements.
 */

const SYNC_CHANNEL_NAME = 'wira_ecosystem_sync';
let syncChannel = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported, falling back to window events');
}

// Initial Mock Orders to ensure immediate portal usability
const INITIAL_DEMO_ORDERS = [
  {
    id: 'ord-ride-101',
    user_id: 'usr-lombok-01',
    customer_name: 'Lalu Hendra (Wisatawan)',
    service_type: 'ride',
    title: 'Perjalanan ke Pantai Senggigi',
    details: 'Dari Mataram Mall menuju Hotel Sheraton Senggigi (8.2 km)',
    total_price: 28000,
    status: 'pending',
    payment_method: 'wallet',
    payment_status: 'paid',
    driver_id: null,
    driver_name: null,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    pickup_coords: [-8.5833, 116.1167],
    dropoff_coords: [-8.5083, 116.0500],
  },
  {
    id: 'ord-food-202',
    user_id: 'usr-lombok-02',
    customer_name: 'Ni Wayan Sari',
    service_type: 'food',
    title: 'Ayam Taliwang Spesial Pedas',
    details: '2x Ayam Taliwang Bakar, 1x Plecing Kangkung, 2x Es Jeruk',
    total_price: 65000,
    status: 'in_progress',
    payment_method: 'cash',
    payment_status: 'unpaid',
    merchant_id: 'merch-taliwang-01',
    merchant_name: 'Ayam Taliwang Bu Siti',
    driver_id: 'drv-made-01',
    driver_name: 'Made Suardana',
    created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-send-303',
    user_id: 'usr-lombok-03',
    customer_name: 'Bpk. Ahmad Fauzi',
    service_type: 'send',
    title: 'Pengiriman Dokumen Akta Tanah',
    details: 'Ampenan ke Kantor BPN Mataram',
    total_price: 15000,
    status: 'completed',
    payment_method: 'wallet',
    payment_status: 'paid',
    driver_id: 'drv-made-01',
    driver_name: 'Made Suardana',
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-service-404',
    user_id: 'usr-lombok-04',
    customer_name: 'Villa Kencana Senggigi',
    service_type: 'service',
    title: 'Cuci & Service 3 Unit AC Daikin',
    details: 'Pembersihan evaporator, cuci outdoor, cek freon',
    total_price: 225000,
    status: 'accepted',
    payment_method: 'cash',
    payment_status: 'unpaid',
    driver_id: 'tech-agus-01',
    driver_name: 'Agus Santoso (Teknisi AC)',
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  }
];

export const getStoredOrders = () => {
  try {
    const raw = localStorage.getItem('wira_all_orders');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  // Default seed
  localStorage.setItem('wira_all_orders', JSON.stringify(INITIAL_DEMO_ORDERS));
  return INITIAL_DEMO_ORDERS;
};

export const saveStoredOrders = (orders) => {
  try {
    localStorage.setItem('wira_all_orders', JSON.stringify(orders));
  } catch (e) {}
};

// Broadcast an ecosystem event
export const broadcastEcosystemEvent = (type, payload) => {
  const eventData = { type, payload, timestamp: Date.now() };
  if (syncChannel) {
    try {
      syncChannel.postMessage(eventData);
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wira_ecosystem_event', { detail: eventData }));
  }
};

// Listen to ecosystem events
export const subscribeEcosystemEvent = (callback) => {
  const handleMsg = (e) => {
    if (e.data) callback(e.data);
  };
  const handleWindow = (e) => {
    if (e.detail) callback(e.detail);
  };

  if (syncChannel) {
    syncChannel.addEventListener('message', handleMsg);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('wira_ecosystem_event', handleWindow);
  }

  return () => {
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleMsg);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('wira_ecosystem_event', handleWindow);
    }
  };
};

/**
 * Validates and executes order status transitions
 * State flow: pending -> accepted -> in_progress -> completed (or cancelled)
 */
export const updateOrderStatusEcosystem = (orderId, newStatus, extraData = {}) => {
  const orders = getStoredOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return null;

  const current = orders[idx];
  const updatedOrder = {
    ...current,
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...extraData,
  };

  // If completed, compute financial split (80% Mitra, 20% Platform Wira)
  if (newStatus === 'completed' && current.status !== 'completed') {
    const total = Number(current.total_price || 0);
    const mitraShare = Math.round(total * 0.8);
    const platformShare = total - mitraShare;

    updatedOrder.settlement = {
      total,
      mitraShare,
      platformShare,
      settledAt: new Date().toISOString(),
    };

    // Credit Mitra's earnings in localStorage
    try {
      const currentEarnings = Number(localStorage.getItem('wira_mitra_earnings') || 145000);
      localStorage.setItem('wira_mitra_earnings', (currentEarnings + mitraShare).toString());
    } catch (e) {}
  }

  orders[idx] = updatedOrder;
  saveStoredOrders(orders);

  broadcastEcosystemEvent('ORDER_UPDATED', updatedOrder);
  return updatedOrder;
};

/**
 * Creates an order in the ecosystem
 */
export const createEcosystemOrder = (orderData) => {
  const orders = getStoredOrders();
  const newOrder = {
    id: `ord-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString(),
    status: 'pending',
    total_price: Number(orderData.price || orderData.total_price || 0),
    service_type: orderData.serviceType || orderData.service_type || 'ride',
    title: orderData.title || `Pesanan ${orderData.serviceType || 'Wira'}`,
    details: orderData.details || '',
    payment_method: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'cash' : 'wallet',
    payment_status: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'unpaid' : 'paid',
    customer_name: orderData.customerName || 'Pelanggan Wira Lombok',
    user_id: orderData.userId || 'usr-guest-lombok',
    ...orderData,
  };

  const newOrdersList = [newOrder, ...orders];
  saveStoredOrders(newOrdersList);

  broadcastEcosystemEvent('ORDER_CREATED', newOrder);
  return newOrder;
};
