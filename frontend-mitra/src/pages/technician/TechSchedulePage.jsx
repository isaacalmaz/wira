import React, { useState, useEffect } from 'react';
import { Card, Badge } from '../../components/shared/UIComponents';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from 'lucide-react';

const TechSchedulePage = () => {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id)
        .eq('service_type', 'service')
        .order('created_at', { ascending: false });

      if (data) {
        setSchedule(data.map(d => ({
          id: d.id,
          time: new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          task: d.title || 'Layanan Servis',
          address: d.details || 'Mataram',
          status: d.status
        })));
      }
    };
    fetchSchedule();
  }, [user]);

  const now = new Date();
  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Jadwal Kalender</h1>
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="font-bold text-primary">{monthName}</span>
          <span className="text-xs text-slate-400">Kalender Tugas</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-slate-500 mb-2">
          <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {[...Array(31)].map((_, i) => (
            <div key={i} className={`p-2 rounded-full w-8 h-8 mx-auto flex items-center justify-center text-xs ${i + 1 === now.getDate() ? 'bg-primary text-white font-bold shadow-md' : 'text-slate-600'}`}>
              {i + 1}
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-primary" /> Agenda Tugas ({now.toLocaleDateString('id-ID')})
        </h2>
        <div className="space-y-3">
          {schedule.length > 0 ? (
            schedule.map(s => (
              <Card key={s.id} className="p-3 flex gap-3 items-center border-l-4 border-l-primary">
                <span className="font-bold w-12 text-center text-slate-600 text-xs">{s.time}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{s.task}</p>
                  <p className="text-xs text-slate-500">{s.address}</p>
                </div>
                <Badge variant={s.status === 'completed' ? 'success' : 'warning'}>{s.status}</Badge>
              </Card>
            ))
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-100">
              Belum ada agenda tugas servis terjadwal.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default TechSchedulePage;
