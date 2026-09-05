import { useState } from 'react';
import Card from '../components/common/Card';
import { VILLAS } from '../data/villas';
import { Star, MapPin } from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';

export default function VillaPage() {
  const [area, setArea] = useState('Semua');
  const areas = ['Semua', 'Senggigi', 'Kuta', 'Sembalun', 'Tetebatu'];

  const filtered = area === 'Semua' ? VILLAS : VILLAS.filter(v => v.area === area);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {areas.map(a => (
          <button key={a} onClick={() => setArea(a)} className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition ${area === a ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            {a}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map(villa => (
          <Card key={villa.id} className="overflow-hidden cursor-pointer hover:shadow-md transition">
            <div className="h-48 bg-slate-200 relative">
              <img src={villa.image} alt={villa.name} className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                <Star size={12} className="text-orange-500" fill="currentColor"/> {villa.rating}
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg dark:text-white leading-tight">{villa.name}</h3>
                <span className="text-sm font-bold text-primary whitespace-nowrap ml-2">{formatRupiah(villa.pricePerNight)}<span className="text-xs text-slate-500 font-normal">/mlm</span></span>
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-1 mb-3"><MapPin size={14}/> {villa.area} • {villa.bedrooms} Kamar Tidur</p>
              <div className="flex gap-2">
                {villa.amenities.map(am => <span key={am} className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{am}</span>)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
