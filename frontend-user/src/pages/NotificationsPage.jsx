import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import Card from '../components/common/Card';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (data) {
        setNotifs(data);
      }
      setLoading(false);
    };

    fetchNotifs();
  }, []);

  const handleMarkAllRead = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false);
      
    if (!error) {
      setNotifs(notifs.map(n => ({ ...n, read: true })));
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
            <Card key={n.id} className={`p-4 flex gap-4 ${n.read ? 'opacity-70' : 'bg-primary/5 border-l-4 border-l-primary'}`}>
              <div className="mt-1"><Bell size={20} className={n.read ? 'text-slate-400' : 'text-primary'} /></div>
              <div>
                <h3 className={`font-semibold ${n.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>{n.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{n.desc}</p>
                <p className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
