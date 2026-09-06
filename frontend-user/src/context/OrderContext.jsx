import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStorage, setStorage } from '../utils/localStorage';
import { supabase } from '../config/supabase';

const OrderContext = createContext();

const INITIAL_ORDERS = [
  {
    id: 'ORD-9821',
    service: 'WiraFood',
    serviceType: 'food',
    title: 'Warung Ayam Taliwang Mas Bos',
    details: '1x Ayam Taliwang Bakar, 1x Plecing Kangkung',
    price: 60000,
    status: 'Selesai',
    date: 'Kemarin, 19:30',
    paymentMethod: 'WiraPay',
  },
  {
    id: 'ORD-9820',
    service: 'WiraRide',
    serviceType: 'ride',
    title: 'Perjalanan ke Lombok Epicentrum Mall',
    details: 'WiraMotor • DR 1234 AB (Ahmad Supardi)',
    price: 15000,
    status: 'Selesai',
    date: '2 hari lalu, 14:15',
    paymentMethod: 'Tunai',
  },
];

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
      await supabase.from('orders').insert([
        {
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
