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
    try { syncChannel.postMessage(eventData); } catch (e) {}
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

export const createEcosystemOrder = async (orderData) => {
  const newOrder = {
    total_price: Number(orderData.price || orderData.total_price || 0),
    service_type: orderData.serviceType || orderData.service_type || 'ride',
    title: orderData.title || `Pesanan ${orderData.serviceType || 'Wira'}`,
    details: orderData.details || '',
    payment_method: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'cash' : 'wallet',
    payment_status: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'unpaid' : 'paid',
    status: 'pending'
  };

  const { data, error } = await supabase
    .from('orders')
    .insert([newOrder])
    .select();

  if (error || !data || data.length === 0) {
    console.error('Error creating order', error);
    return null;
  }
  
  broadcastEcosystemEvent('ORDER_CREATED', data[0]);
  return data[0];
};
