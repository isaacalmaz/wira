import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }

    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        // Mapping tipe DB ke UI
        const mappedOrders = data.map(o => {
          let uiService = 'WiraRide';
          if (o.service_type === 'food') uiService = 'WiraFood';
          else if (o.service_type === 'send') uiService = 'WiraSend';
          else if (o.service_type === 'villa') uiService = 'WiraVilla';
          
          return {
            id: o.id,
            service: uiService,
            title: `Pesanan ${uiService}`,
            date: new Date(o.created_at).toLocaleDateString('id-ID'),
            status: o.status === 'pending' ? 'Berjalan' : (o.status === 'completed' ? 'Selesai' : o.status),
            price: o.total_price || 0,
          };
        });
        setOrders(mappedOrders);
      }
    };

    fetchOrders();
  }, [user]);

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
