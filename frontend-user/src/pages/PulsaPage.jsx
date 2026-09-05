import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { Smartphone, Zap, Droplet, ShieldPlus } from 'lucide-react';

export default function PulsaPage() {
  const [tab, setTab] = useState('Pulsa');
  const tabs = [{id:'Pulsa', icon:Smartphone}, {id:'Data', icon:Smartphone}, {id:'PLN', icon:Zap}, {id:'PDAM', icon:Droplet}, {id:'BPJS', icon:ShieldPlus}];
  const denoms = [20000, 50000, 100000, 150000, 200000, 500000];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-xl whitespace-nowrap flex items-center gap-2 text-sm font-medium ${tab === t.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
              <Icon size={16} /> {t.id}
            </button>
          )
        })}
      </div>

      <Card className="p-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nomor Tujuan / ID Pelanggan</label>
        <div className="relative">
          <input type="tel" placeholder="Contoh: 081234567890" className="w-full p-3 border rounded-lg text-lg font-semibold tracking-wide dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary" />
          <span className="absolute right-3 top-3 text-sm font-bold text-red-500">Telkomsel</span>
        </div>
      </Card>

      <div>
        <h3 className="font-semibold text-lg mb-3 dark:text-white">Pilih Nominal</h3>
        <div className="grid grid-cols-2 gap-3">
          {denoms.map(d => (
            <Card key={d} className="p-4 text-center cursor-pointer hover:border-primary border-2 border-transparent active:bg-slate-50 transition">
              <p className="font-bold text-lg dark:text-white">{formatRupiah(d)}</p>
              <p className="text-xs text-slate-500 mt-1">Harga: {formatRupiah(d + 1500)}</p>
            </Card>
          ))}
        </div>
      </div>
      
      <Button className="w-full py-4 text-lg" onClick={() => alert('Fitur Pembayaran Sedang Diproses')}>Beli Sekarang</Button>
    </div>
  );
}
