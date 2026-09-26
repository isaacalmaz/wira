/**
 * Wira Ecosystem Service & State Synchronizer
 */
import { supabase } from '../config/supabase';

const SYNC_CHANNEL_NAME = 'wira_ecosystem_sync';
let syncChannel = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported');
}

export const getStoredOrders = async () => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
  return data || [];
};

export const broadcastEcosystemEvent = (type, payload) => {
  const eventData = { type, payload, timestamp: Date.now() };
  if (syncChannel) {
    try { syncChannel.postMessage(eventData); } catch { /* channel closed; ignore */ }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wira_ecosystem_event', { detail: eventData }));
  }
};

export const subscribeEcosystemEvent = (callback) => {
  const handleMsg = (e) => { if (e.data) callback(e.data); };
  const handleWindow = (e) => { if (e.detail) callback(e.detail); };

  if (syncChannel) syncChannel.addEventListener('message', handleMsg);
  if (typeof window !== 'undefined') window.addEventListener('wira_ecosystem_event', handleWindow);

  return () => {
    if (syncChannel) syncChannel.removeEventListener('message', handleMsg);
    if (typeof window !== 'undefined') window.removeEventListener('wira_ecosystem_event', handleWindow);
  };
};

export const updateOrderStatusEcosystem = async (orderId, newStatus, extraData = {}) => {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus, ...extraData })
    .eq('id', orderId)
    .select();

  if (error || !data || data.length === 0) return null;
  const updatedOrder = data[0];

  broadcastEcosystemEvent('ORDER_UPDATED', updatedOrder);
  return updatedOrder;
};

// Maps a checkout page's UI payment label ('WiraPay' / 'Tunai' / 'Transfer')
// to orders.payment_method. Only 'wallet' moves WiraPay money, and only via
// the create_order_and_pay RPC (migrations/0070). Previously every
// non-"tunai" label (including Pool/Villa's "Transfer Bank") became
// 'wallet' + 'paid' with no money moved, which the refund RPCs would then
// happily "refund".
export const toDbPaymentMethod = (uiPaymentMethod) => {
  const label = (uiPaymentMethod || '').toLowerCase();
  if (label.includes('tunai') || label === 'cash') return 'cash';
  if (label.includes('transfer')) return 'transfer';
  return 'wallet';
};
