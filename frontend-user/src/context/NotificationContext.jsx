import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    if (!user) {
      setNotifications([]);
      return;
    }

    // Scoped to the current user - previously this had no user_id filter at
    // all, so every signed-in customer's query returned every row in
    // public.notifications (RLS - migrations/0053 - now also enforces
    // auth.uid() = user_id server-side, but this client-side filter stays
    // as the honest, explicit query rather than relying on RLS alone).
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Gagal memuat notifikasi:', error);
      toast.error('Gagal memuat notifikasi: ' + error.message);
      return;
    }

    setNotifications(data || []);
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.id]);

  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.is_read).length);
  }, [notifications]);

  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), is_read: false, ...notif }, ...prev]);
  };

  const markRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, fetchNotifications, setNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
