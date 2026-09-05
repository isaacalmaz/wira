import React, { useState } from 'react';
import { techOrders } from '../../data/orders';
import { techSchedule } from '../../data/schedule';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import OnlineToggle from '../../components/shared/OnlineToggle';
import EarningsCard from '../../components/shared/EarningsCard';
import { Calendar, Wrench } from 'lucide-react';

const TechHomePage = () => {
  const [isOnline, setIsOnline] = useState(true);
  const incoming = techOrders.filter(o => o.status === 'Incoming');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Halo, Pak Joko!</h1>
          <p className="text-slate-500">Teknisi AC & Listrik</p>
        </div>
        <div className="flex flex-col items-end">
          <OnlineToggle isOnline={isOnline} onChange={setIsOnline} />
          <span className="text-xs mt-1 font-medium text-slate-500">TERIMA PANGGILAN</span>
        </div>
      </div>

      <EarningsCard today={450000} week={2100000} progress={90} />

      {isOnline && incoming.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3">Panggilan Baru</h2>
          {incoming.map(job => (
            <Card key={job.id} className="p-4 border-l-4 border-l-accent">
              <div className="flex justify-between">
                <Badge variant="warning">{job.type}</Badge>
                <span className="font-bold">~Rp {job.estPrice.toLocaleString()}</span>
              </div>
              <h3 className="font-bold mt-2">{job.desc}</h3>
              <p className="text-sm text-slate-500 my-1">{job.address} • {job.schedule}</p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" className="flex-1">Tolak</Button>
                <Button variant="primary" className="flex-1">Terima</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Calendar size={20}/> Jadwal Hari Ini</h2>
        <div className="space-y-3">
          {techSchedule.map(s => (
            <div key={s.id} className="flex gap-4 items-center bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100">
              <div className="text-center min-w-[50px]">
                <p className="font-bold text-lg text-primary">{s.time}</p>
              </div>
              <div className="flex-1 border-l-2 border-slate-100 pl-3">
                <p className="font-semibold">{s.task}</p>
                <p className="text-sm text-slate-500">{s.address}</p>
              </div>
              <Badge variant={s.status === 'Completed' ? 'success' : 'gray'}>{s.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default TechHomePage;
