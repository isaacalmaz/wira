import React from 'react';
import { Card, Button, StarRating } from '../../components/shared/UIComponents';
import { Store, MapPin, Clock, CreditCard } from 'lucide-react';

const MerchantProfilePage = () => (
  <div className="space-y-6">
    <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-700">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
        <Store size={40} className="text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Warung Sasak</h1>
      <p className="text-slate-500">Makanan Tradisional Lombok</p>
      <div className="flex justify-center items-center gap-2 mt-2">
        <StarRating rating={4.6} /> <span className="font-medium">4.6 (128 Ulasan)</span>
      </div>
    </div>

    <Card className="p-0">
      <div className="p-4 border-b border-slate-100 flex items-start gap-3">
        <MapPin className="text-slate-400 mt-1" />
        <div>
          <p className="font-semibold">Alamat Resto</p>
          <p className="text-sm text-slate-500">Jl. Pejanggik No. 88, Mataram, Nusa Tenggara Barat</p>
        </div>
      </div>
      <div className="p-4 border-b border-slate-100 flex items-start gap-3">
        <Clock className="text-slate-400 mt-1" />
        <div>
          <p className="font-semibold">Jam Operasional</p>
          <p className="text-sm text-slate-500">Setiap Hari: 09:00 - 22:00</p>
        </div>
      </div>
      <div className="p-4 flex items-start gap-3">
        <CreditCard className="text-slate-400 mt-1" />
        <div>
          <p className="font-semibold">Rekening Pencairan</p>
          <p className="text-sm text-slate-500">Bank NTB Syariah - 1234567890 (a.n Warung Sasak)</p>
        </div>
      </div>
    </Card>

    <Button variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500">Keluar</Button>
  </div>
);
export default MerchantProfilePage;
