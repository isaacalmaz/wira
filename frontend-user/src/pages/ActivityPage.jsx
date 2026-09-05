import { useState } from 'react';
import { SERVICES } from '../config/services';
import Card from '../components/common/Card';
import { formatRupiah } from '../utils/formatRupiah';

export default function ActivityPage() {
  const [tab, setTab] = useState('Semua');
  const tabs = ['Semua', 'WiraRide', 'WiraFood', 'WiraSend', 'WiraVilla'];

  const activities = [
    { id: 1, service: 'WiraRide', title: 'Perjalanan ke Mataram Mall', date: 'Hari ini, 10:00', price: 15000, status: 'Selesai' },
    { id: 2, service: 'WiraFood', title: 'Ayam Taliwang Mas Bos', date: 'Kemarin, 19:30', price: 65000, status: 'Selesai' },
    { id: 3, service: 'WiraSend', title: 'Paket Dokumen', date: '3 hari lalu', price: 12000, status: 'Dibatalkan' }
  ];

  const filtered = tab === 'Semua' ? activities : activities.filter(a => a.service === tab);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold dark:text-white mb-4">Aktivitas Saya</h2>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium ${tab === t ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{t}</button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map(act => (
          <Card key={act.id} className="p-4 hover:border-primary cursor-pointer">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs font-bold text-primary">{act.service}</span>
                <h3 className="font-semibold text-slate-800 dark:text-white">{act.title}</h3>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${act.status === 'Selesai' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{act.status}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">{act.date}</span>
              <span className="font-bold">{formatRupiah(act.price)}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
