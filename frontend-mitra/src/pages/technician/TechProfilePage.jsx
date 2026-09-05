import React from 'react';
import { Card, Badge, StarRating, Button } from '../../components/shared/UIComponents';
import { User, Wrench, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const TechProfilePage = () => {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
          <User size={40} className="text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user?.name || 'Pak Joko'}</h1>
          <p className="text-slate-500">Teknisi Wira</p>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={4.9} /> <span className="font-medium">4.9</span>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Wrench size={18}/> Spesialisasi</h3>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="primary">AC & Pendingin</Badge>
          <Badge variant="primary">Instalasi Listrik</Badge>
          <Badge variant="primary">Elektronik</Badge>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2"><ImageIcon size={18}/> Portfolio Hasil Kerja</h3>
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => (
            <div key={i} className="aspect-square bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-400">Foto {i}</div>
          ))}
        </div>
      </Card>
      
      <Button variant="outline" className="w-full text-red-500 border-red-500">Keluar Akun</Button>
    </div>
  );
};
export default TechProfilePage;
