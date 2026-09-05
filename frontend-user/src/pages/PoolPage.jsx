import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';

export default function PoolPage() {
  const services = [
    { id: 1, name: 'Pembersihan Rutin', price: 200000, desc: 'Pembersihan kolam standar termasuk vakum' },
    { id: 2, name: 'Treatment Air', price: 150000, desc: 'Pengecekan dan penyeimbangan chemical air' },
    { id: 3, name: 'Perbaikan Pompa', price: 300000, desc: 'Servis pompa dan filter kolam renang' }
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-6 border-0">
        <h2 className="text-xl font-bold mb-2">Paket Langganan Bulanan</h2>
        <p className="text-sm opacity-90 mb-4">Solusi hemat untuk kolam renang selalu bersih. Termasuk 2x pembersihan dan 1x treatment air per bulan.</p>
        <div className="flex justify-between items-center">
          <p className="text-2xl font-bold">{formatRupiah(500000)}<span className="text-sm font-normal">/bln</span></p>
          <Button variant="secondary">Langganan</Button>
        </div>
      </Card>

      <div>
        <h3 className="font-bold text-lg mb-3 dark:text-white">Layanan Satuan</h3>
        <div className="space-y-3">
          {services.map(s => (
            <Card key={s.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h4 className="font-bold dark:text-white">{s.name}</h4>
                <p className="text-sm text-slate-500">{s.desc}</p>
                <p className="font-bold text-primary mt-1">{formatRupiah(s.price)}</p>
              </div>
              <Button size="sm">Pesan</Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
