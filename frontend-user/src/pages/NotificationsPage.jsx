import { Bell } from 'lucide-react';
import Card from '../components/common/Card';

export default function NotificationsPage() {
  const notifs = [
    { id: 1, title: 'Order Selesai!', desc: 'Makanan Anda telah sampai. Selamat menikmati!', time: '10 menit lalu', read: false },
    { id: 2, title: 'Promo WiraRide', desc: 'Diskon 50% untuk perjalanan pertama Anda hari ini.', time: '2 jam lalu', read: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold dark:text-white">Notifikasi</h2>
        <button className="text-sm text-primary">Tandai semua dibaca</button>
      </div>
      <div className="space-y-3">
        {notifs.map(n => (
          <Card key={n.id} className={`p-4 flex gap-4 ${n.read ? 'opacity-70' : 'bg-primary/5 border-l-4 border-l-primary'}`}>
            <div className="mt-1"><Bell size={20} className={n.read ? 'text-slate-400' : 'text-primary'} /></div>
            <div>
              <h3 className={`font-semibold ${n.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>{n.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{n.desc}</p>
              <p className="text-xs text-slate-400 mt-2">{n.time}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
