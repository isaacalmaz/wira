import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStorage, setStorage } from '../utils/localStorage';
import { supabase } from '../config/supabase';

const OrderContext = createContext();

const INITIAL_ORDERS = [];

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState(() => getStorage('wira_user_orders', INITIAL_ORDERS));

  useEffect(() => {
    setStorage('wira_user_orders', orders);
  }, [orders]);

  const addOrder = async (orderData) => {
    const newOrder = {
      id: `ORD-${Date.now().toString().slice(-4)}`,
      date: 'Hari ini, ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      status: orderData.status || 'Berjalan',
      ...orderData,
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Kirim ke database Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('orders').insert([
        {
          user_id: session?.user?.id || null,
          service_type: orderData.serviceType || 'ride',
          status: 'pending',
          total_price: orderData.price,
          payment_method: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'cash' : 'wallet',
          payment_status: orderData.paymentMethod?.toLowerCase().includes('tunai') ? 'unpaid' : 'paid',
        },
      ]);
    } catch (err) {
      console.log('Saved to local storage:', err);
    }

    return newOrder;
  };

  const updateOrderStatus = (id, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );
  };

  return (
    <OrderContext.Provider value={{ orders, addOrder, updateOrderStatus }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => useContext(OrderContext);
