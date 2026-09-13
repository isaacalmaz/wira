import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import Card from '../components/common/Card';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { useNotification } from '../context/NotificationContext';

export default function NotificationsPage() {
  const { notifications: notifs, setNotifications } = useNotification();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Context already fetches it on mount, so just turn off loading
    setLoading(false);
  }, []);

  const handleMarkAllRead = async () => {
    const hasUnread = notifs.some(n => !n.is_read);
    if (!hasUnread) {
      toast.success("Semua notifikasi sudah dibaca");
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)
      .select();
      
    if (error) {
      toast.error("Gagal menandai dibaca: " + error.message);
    } else if (!data || data.length === 0) {
      toast.error("Gagal menandai dibaca (Akses Ditolak)");
    } else {
      setNotifications(notifs.map(n => ({ ...n, is_read: true })));
      toast.success("Semua notifikasi ditandai dibaca");
    }
  };

  if (loading) {
    return <div className="p-10 text-center animate-pulse">Memuat notifikasi...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold dark:text-white">Notifikasi</h2>
        <button className="text-sm text-primary" onClick={handleMarkAllRead}>Tandai semua dibaca</button>
      </div>
      <div className="space-y-3">
        {notifs.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-500 font-medium">Belum ada notifikasi baru</p>
          </div>
        ) : (
          notifs.map(n => (
            <Card key={n.id} className={`p-4 flex gap-4 ${n.is_read ? 'opacity-70' : 'bg-primary/5 border-l-4 border-l-primary'}`}>
              <div className="mt-1"><Bell size={20} className={n.is_read ? 'text-slate-400' : 'text-primary'} /></div>
              <div>
                <h3 className={`font-semibold ${n.is_read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>{n.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{n.description}</p>
                <p className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
