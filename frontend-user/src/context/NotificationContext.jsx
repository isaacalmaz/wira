import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (data) {
      setNotifications(data);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

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
