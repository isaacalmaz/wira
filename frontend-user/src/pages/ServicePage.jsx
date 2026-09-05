import { Wrench, Star } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { TECHNICIANS } from '../data/technicians';
import { formatRupiah } from '../utils/formatRupiah';

export default function ServicePage() {
  const categories = [
    { id: 'AC', icon: '❄️', name: 'Service AC', price: 75000 },
    { id: 'Listrik', icon: '⚡', name: 'Listrik', price: 50000 },
    { id: 'Plumbing', icon: '🔧', name: 'Plumbing', price: 60000 },
    { id: 'Tukang', icon: '🏗️', name: 'Tukang Bangunan', price: 100000 }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {categories.map(c => (
          <Card key={c.id} className="p-4 cursor-pointer hover:border-primary text-center">
            <span className="text-3xl mb-2 block">{c.icon}</span>
            <h3 className="font-semibold text-sm dark:text-white">{c.name}</h3>
            <p className="text-xs text-slate-500">Mulai {formatRupiah(c.price)}</p>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="font-bold text-lg mb-3 dark:text-white flex items-center gap-2"><Wrench size={20}/> Teknisi Rekomendasi</h3>
        <div className="space-y-3">
          {TECHNICIANS.map(tech => (
            <Card key={tech.id} className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-200"></div>
              <div className="flex-1">
                <h4 className="font-bold dark:text-white">{tech.name}</h4>
                <p className="text-xs text-slate-500">{tech.category} • Pengalaman {tech.experience} thn</p>
                <div className="flex items-center gap-1 mt-1 text-sm text-slate-600 dark:text-slate-400">
                  <Star size={14} className="text-orange-500" fill="currentColor"/> {tech.rating}
                </div>
              </div>
              <Button size="sm">Pilih</Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
