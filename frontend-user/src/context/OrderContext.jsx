import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import { 
  getStoredOrders, 
  createEcosystemOrder, 
  updateOrderStatusEcosystem, 
  subscribeEcosystemEvent 
} from '../services/ecosystemService';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const { user } = useAuth();

  const mapDbOrderToUi = (o) => {
    let uiService = 'WiraRide';
    if (o.service_type === 'food') uiService = 'WiraFood';
    else if (o.service_type === 'send') uiService = 'WiraSend';
    else if (o.service_type === 'villa') uiService = 'WiraVilla';
    else if (o.service_type === 'service') uiService = 'WiraService';
    else if (o.service_type === 'pool') uiService = 'WiraPool';
    else if (o.service_type === 'pulsa') uiService = 'WiraPulsa';

    let formattedStatus = o.status;
    if (o.status === 'pending') formattedStatus = 'Sedang Mencari';
    else if (o.status === 'accepted') formattedStatus = 'Dikonfirmasi';
    else if (o.status === 'working' || o.status === 'picking_up') formattedStatus = 'Berjalan';
    else if (o.status === 'completed') formattedStatus = 'Selesai';
    else if (o.status === 'cancelled') formattedStatus = 'Dibatalkan';

    return {
      id: o.id,
      service: uiService,
      title: o.title || `Pesanan ${uiService}`,
      date: new Date(o.created_at || Date.now()).toLocaleDateString('id-ID'),
      status: formattedStatus,
      price: o.total_price || 0,
      rawStatus: o.status,
      details: o.details,
      driver_name: o.driver_name,
      ...o
    };
  };

  useEffect(() => {
    const fetchOrders = async () => {
      // 1. Check Supabase first if user exists
      if (user) {
        try {
          const { data } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          // Selalu update order sesuai DB meskipun kosong (agar tidak fallback ke local dummy)
          if (data) {
            setOrders(data.map(mapDbOrderToUi));
            return;
          }
        } catch (e) {
          console.warn('Supabase fetch orders error:', e);
        }
      }

      // 2. Load from ecosystem store HANYA untuk guest (belum login)
      if (!user) {
        const local = getStoredOrders();
        setOrders(local.map(mapDbOrderToUi));
      }
    };

    fetchOrders();

    // Subscribe to cross-portal ecosystem events
    const unsubscribe = subscribeEcosystemEvent((event) => {
      if (event.type === 'ORDER_CREATED') {
        setOrders((prev) => [mapDbOrderToUi(event.payload), ...prev]);
      } else if (event.type === 'ORDER_UPDATED') {
        setOrders((prev) =>
          prev.map((o) => (o.id === event.payload.id ? mapDbOrderToUi(event.payload) : o))
        );
      }
    });

    return () => unsubscribe();
  }, [user]);

  const addOrder = async (orderData) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let createdOrder = null;

      // Try Supabase insert
      try {
        const { data, error } = await supabase.from('orders').insert([
          {
            user_id: session?.user?.id || user?.id || null,
            merchant_id: orderData.merchantId || null,
            service_type: orderData.serviceType || 'ride',
            status: 'pending',
            total_price: orderData.price,
            title: orderData.title || null,
            details: orderData.details || null,
            payment_method: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'cash' : 'wallet',
            payment_status: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'unpaid' : 'paid',
          },
        ]).select().single();

        if (!error && data) {
          createdOrder = data;
        }
      } catch (dbErr) {
        console.warn('Direct DB insert fallback to ecosystem sync:', dbErr);
      }

      // If DB was not available or guest, record in Ecosystem service
      if (!createdOrder) {
        createdOrder = createEcosystemOrder({
          ...orderData,
          userId: session?.user?.id || user?.id || 'usr-lombok-guest',
          customerName: user?.user_metadata?.name || user?.name || 'Pelanggan Wira Lombok',
        });
      } else {
        createEcosystemOrder({
          ...createdOrder,
          id: createdOrder.id,
          price: createdOrder.total_price,
          serviceType: createdOrder.service_type,
        });
      }

      const uiOrder = mapDbOrderToUi(createdOrder);
      setOrders((prev) => [uiOrder, ...prev.filter(o => o.id !== uiOrder.id)]);
      return uiOrder;
    } catch (err) {
      console.error('Gagal membuat pesanan:', err);
      // Even on failure, guarantee order creation so user is never blocked
      const fallback = createEcosystemOrder(orderData);
      const uiOrder = mapDbOrderToUi(fallback);
      setOrders((prev) => [uiOrder, ...prev]);
      return uiOrder;
    }
  };

  const updateOrderStatus = (id, newStatus, extraData = {}) => {
    updateOrderStatusEcosystem(id, newStatus, extraData);
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus, rawStatus: newStatus, ...extraData } : o))
    );
  };

  return (
    <OrderContext.Provider value={{ orders, addOrder, updateOrderStatus }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => useContext(OrderContext);

