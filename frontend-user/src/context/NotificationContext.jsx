import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import { useTranslation } from '../i18n';
import { friendlyError } from '../utils/friendlyError';
import { onMessageListener } from '../config/firebase';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const recentToastsRef = useRef(new Set());

  const fetchNotifications = useCallback(async () => {
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
      console.error('Failed to load notifications:', error);
      toast.error(t('notifications.load_failed', { message: friendlyError(error) }));
      return;
    }

    setNotifications(data || []);
  }, [user, t]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return undefined;
    }

    fetchNotifications();

    const channel = supabase
      .channel(`user-notifs-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new;
          if (newNotif) {
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
            const key = `${newNotif.id || ''}:${newNotif.title || ''}`;
            recentToastsRef.current.add(key);
            setTimeout(() => recentToastsRef.current.delete(key), 8000);
            const text = newNotif.description ? `${newNotif.title}: ${newNotif.description}` : newNotif.title;
            toast(text, {
              duration: 5000,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new;
          if (updated) {
            setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          }
        }
      )
      .subscribe();

    // Foreground FCM web push listener
    let isFcmActive = true;
    const listenFcm = () => {
      onMessageListener()
        .then((payload) => {
          if (!isFcmActive) return;
          if (payload) {
            const title = payload.notification?.title || payload.data?.title || '';
            const body = payload.notification?.body || payload.data?.body || payload.data?.description || '';
            const notifId = payload.data?.id || payload.data?.notification_id || '';
            const key = `${notifId}:${title}`;
            if (title && !recentToastsRef.current.has(key)) {
              recentToastsRef.current.add(key);
              setTimeout(() => recentToastsRef.current.delete(key), 8000);
              const text = body ? `${title}: ${body}` : title;
              toast(text, { duration: 5000 });
              fetchNotifications();
            }
          }
          listenFcm();
        })
        .catch((err) => {
          console.warn('FCM foreground listener error:', err);
        });
    };
    listenFcm();

    // Foreground native push listener (Android WebView)
    let nativeListenerHandle = null;
    (async () => {
      try {
        const { isNative } = await import('../native/nativeShell');
        if (isNative()) {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          nativeListenerHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            const title = notification?.title || '';
            const body = notification?.body || '';
            const notifId = notification?.data?.id || notification?.id || '';
            const key = `${notifId}:${title}`;
            if (title && !recentToastsRef.current.has(key)) {
              recentToastsRef.current.add(key);
              setTimeout(() => recentToastsRef.current.delete(key), 8000);
              const text = body ? `${title}: ${body}` : title;
              toast(text, { duration: 5000 });
              fetchNotifications();
            }
          });
        }
      } catch (err) {
        console.warn('Native push listener error:', err);
      }
    })();

    return () => {
      isFcmActive = false;
      if (nativeListenerHandle?.remove) {
        nativeListenerHandle.remove();
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.is_read).length);
  }, [notifications]);

  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), is_read: false, ...notif }, ...prev]);
  };

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, fetchNotifications, setNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);
