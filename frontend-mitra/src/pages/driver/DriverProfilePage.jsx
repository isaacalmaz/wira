import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge, Button, StarRating } from '../../components/shared/UIComponents';
import { User, ShieldCheck, Car, FileText, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const DriverProfilePage = () => {
  const { user, signOut } = useAuth();
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center overflow-hidden">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="text-slate-400" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold capitalize">{user?.name || 'Driver Wira'}</h1>
          <p className="text-slate-500">{user?.phone || 'Belum mengatur nomor HP'}</p>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={5.0} />
            <span className="text-sm font-medium">5.0</span>
          </div>
        </div>
      </div>

      <Card className="p-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <Car className="text-primary" />
          <div>
            <p className="font-semibold">Kendaraan Mitra</p>
            <p className="text-sm text-slate-500">Data kendaraan diverifikasi admin</p>
          </div>
        </div>
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-green-500" />
            <span className="font-medium">Status Akun</span>
          </div>
          <Badge variant="success">Terverifikasi</Badge>
        </div>
        <Link to="/driver/settings" className="p-4 flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          <Settings className="text-slate-400" />
          <span className="font-medium">Pengaturan Akun</span>
        </Link>
      </Card>
      
      <Button variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white" onClick={signOut}>Keluar Akun</Button>
    </div>
  );
};
export default DriverProfilePage;
