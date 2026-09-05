import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Package, Truck } from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';

export default function SendPage() {
  const [step, setStep] = useState('form');

  const packages = [
    { id: 'dokumen', name: 'Dokumen', desc: '< 1kg', price: 8000 },
    { id: 'kecil', name: 'Kecil', desc: '< 5kg', price: 12000 },
    { id: 'sedang', name: 'Sedang', desc: '< 15kg', price: 18000 },
    { id: 'besar', name: 'Besar', desc: '< 30kg', price: 30000 }
  ];

  return (
    <div className="space-y-6">
      {step === 'form' && (
        <>
          <Card className="p-4 space-y-4">
            <h3 className="font-bold dark:text-white border-b pb-2">Detail Pengirim</h3>
            <input type="text" placeholder="Nama Pengirim" className="w-full p-2 border rounded-lg text-sm" />
            <input type="tel" placeholder="Nomor HP" className="w-full p-2 border rounded-lg text-sm" />
            <textarea placeholder="Alamat Pengambilan" className="w-full p-2 border rounded-lg text-sm" rows="2"></textarea>
          </Card>
          
          <Card className="p-4 space-y-4">
            <h3 className="font-bold dark:text-white border-b pb-2">Detail Penerima</h3>
            <input type="text" placeholder="Nama Penerima" className="w-full p-2 border rounded-lg text-sm" />
            <input type="tel" placeholder="Nomor HP" className="w-full p-2 border rounded-lg text-sm" />
            <textarea placeholder="Alamat Tujuan" className="w-full p-2 border rounded-lg text-sm" rows="2"></textarea>
          </Card>

          <Card className="p-4">
            <h3 className="font-bold dark:text-white mb-4">Pilih Ukuran Paket</h3>
            <div className="grid grid-cols-2 gap-3">
              {packages.map(p => (
                <div key={p.id} className="border p-3 rounded-lg hover:border-primary cursor-pointer text-center group active:bg-slate-50">
                  <Package className="mx-auto mb-2 text-slate-400 group-hover:text-primary" />
                  <p className="font-semibold text-sm dark:text-white">{p.name}</p>
                  <p className="text-xs text-slate-500 mb-1">{p.desc}</p>
                  <p className="font-bold text-primary text-sm">Mulai {formatRupiah(p.price)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Button className="w-full" size="lg" onClick={() => setStep('tracking')}>Pesan Kurir Sekarang</Button>
        </>
      )}

      {step === 'tracking' && (
        <Card className="p-8 text-center space-y-4">
          <Truck size={48} className="mx-auto text-primary" />
          <h2 className="text-xl font-bold dark:text-white">Kurir Sedang Menuju Lokasi</h2>
          <p className="text-sm text-slate-500">Estimasi tiba dalam 10 menit.</p>
          <div className="bg-slate-100 p-4 rounded-lg mt-4 text-left">
            <p className="font-semibold text-sm">No. Resi: WRS-987654321</p>
            <p className="text-xs text-slate-500">Kurir: Budi Santoso</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setStep('form')}>Kembali</Button>
        </Card>
      )}
    </div>
  );
}
