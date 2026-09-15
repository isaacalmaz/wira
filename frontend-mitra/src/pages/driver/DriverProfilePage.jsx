import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, Badge, Button, StarRating } from '../../components/shared/UIComponents';
import { User, ShieldCheck, Car, FileText, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const DriverProfilePage = () => {
  const { user, logout } = useAuth();
  // This component is reused under both /driver (Ride) and /courier
  // (Kurir/Send) portals - link targets must follow whichever root the
  // caller is actually on, same pattern as MerchantProfilePage.jsx.
  const { pathname } = useLocation();
  const basePath = pathname.startsWith('/courier') ? '/courier' : '/driver';
  const [vehicle, setVehicle] = useState('Memuat data...');
  const [plate, setPlate] = useState('');

  useEffect(() => {
    const fetchRegData = async () => {
      const { data } = await supabase.from('feature_flags').select('features').eq('region', 'mitra_registrations').single();
      if (data && data.features) {
        // Vehicle/plate are the same physical motorbike for both roles, so
        // match either registration - a dual-capability user who activated
        // 'courier' via the Settings toggle (rather than registering for it
        // separately) only ever has a 'driver' registration row on file.
        const myReg = data.features.find(f => f.auth_id === user?.id && (f.role === 'driver' || f.role === 'courier'));
        if (myReg) {
          setVehicle(myReg.vehicle || 'Kendaraan Mitra');
          setPlate(myReg.plate || '');
        } else {
          setVehicle('Data kendaraan tidak ditemukan');
        }
      }
    };
    if (user) fetchRegData();
  }, [user]);
  
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
            <p className="font-semibold capitalize">{vehicle}</p>
            <p className="text-sm text-slate-500 uppercase">{plate || 'Menunggu verifikasi admin'}</p>
          </div>
        </div>
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-green-500" />
            <span className="font-medium">Status Akun</span>
          </div>
          <Badge variant="success">Terverifikasi</Badge>
        </div>
        <Link to={`${basePath}/settings`} className="p-4 flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          <Settings className="text-slate-400" />
          <span className="font-medium">Pengaturan Akun</span>
        </Link>
      </Card>
      
      <Button variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white" onClick={logout}>Keluar Akun</Button>
    </div>
  );
};
export default DriverProfilePage;
