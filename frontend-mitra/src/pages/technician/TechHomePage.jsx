import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import OnlineToggle from '../../components/shared/OnlineToggle';
import EarningsCard from '../../components/shared/EarningsCard';
import { Calendar, Wrench, BellRing, MapPin } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const TechHomePage = () => {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);

  useEffect(() => {
    const fetchTechData = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('orders')
        .select('*')
        .or(`driver_id.eq.${user.id},service_type.eq.service`)
        .order('created_at', { ascending: false });

      if (data) {
        const completed = data.filter(d => d.status === 'completed' && d.driver_id === user.id);
        const todayStr = new Date().toLocaleDateString('id-ID');
        let tEarn = 0;
        let wEarn = 0;

        completed.forEach(c => {
          const price = c.total_price || 0;
          if (new Date(c.created_at).toLocaleDateString('id-ID') === todayStr) {
            tEarn += price;
          }
          wEarn += price;
        });

        setTodayEarnings(tEarn);
        setWeekEarnings(wEarn);

        // Pekerjaan hari ini
        const activeJobs = data.filter(d => d.status === 'accepted' || d.status === 'working');
        setTodayOrders(activeJobs);
      }
    };
    fetchTechData();

    // Listen incoming orders
    if (!isOnline || !user) {
      setIncomingOrder(null);
      return;
    }

    const channel = supabase
      .channel('tech-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.new.status === 'pending' && payload.new.service_type === 'service') {
            setIncomingOrder(payload.new);
            toast.success('Panggilan Jasa Baru Masuk!', { icon: '🔧' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnline, user]);

  const handleAcceptJob = async () => {
    if (!incomingOrder || !user) return;
    try {
      await supabase.from('orders').update({ status: 'accepted', driver_id: user.id }).eq('id', incomingOrder.id);
      toast.success('Panggilan jasa diterima!');
      setIncomingOrder(null);
    } catch (err) {
      toast.error('Gagal menerima panggilan');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Halo, {user?.name || 'Mitra Teknisi'}!</h1>
          <p className="text-slate-500">Mitra Jasa Servis Wira</p>
        </div>
        <div className="flex flex-col items-end">
          <OnlineToggle isOnline={isOnline} onChange={setIsOnline} />
          <span className="text-xs mt-1 font-medium text-slate-500">TERIMA PANGGILAN</span>
        </div>
      </div>

      <EarningsCard today={todayEarnings} week={weekEarnings} progress={weekEarnings > 0 ? 100 : 0} />

      {isOnline && incomingOrder && (
        <div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2 text-primary">
            <BellRing size={20} className="animate-bounce" /> Panggilan Baru
          </h2>
          <Card className="p-4 border-l-4 border-l-primary shadow-lg animate-in fade-in">
            <div className="flex justify-between">
              <Badge variant="warning">{incomingOrder.title || 'Servis Panggilan'}</Badge>
              <span className="font-bold text-primary">Rp {(incomingOrder.total_price || 0).toLocaleString('id-ID')}</span>
            </div>
            <h3 className="font-bold mt-2">{incomingOrder.details || 'Permintaan perbaikan'}</h3>
            <p className="text-sm text-slate-500 my-1 flex items-center gap-1"><MapPin size={14}/> Mataram dan sekitarnya</p>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptJob}>Terima Panggilan</Button>
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Calendar size={20}/> Jadwal Pekerjaan</h2>
        <div className="space-y-3">
          {todayOrders.length > 0 ? (
            todayOrders.map(s => (
              <div key={s.id} className="flex gap-4 items-center bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100">
                <div className="text-center min-w-[50px]">
                  <p className="font-bold text-sm text-primary">{new Date(s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex-1 border-l-2 border-slate-100 pl-3">
                  <p className="font-semibold">{s.title || 'Servis'}</p>
                  <p className="text-sm text-slate-500">{s.details || '-'}</p>
                </div>
                <Badge variant={s.status === 'working' ? 'primary' : 'warning'}>{s.status}</Badge>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-100">
              Belum ada jadwal pekerjaan aktif saat ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default TechHomePage;
