import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, StarRating } from '../../components/shared/UIComponents';
import { Store, MapPin, Clock, CreditCard, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const MerchantProfilePage = () => {
  const { user, signOut } = useAuth();
  const [merchant, setMerchant] = useState(null);

  useEffect(() => {
    const fetchMerchant = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('owner_id', user.id)
        .single();
      if (data) setMerchant(data);
    };
    fetchMerchant();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 overflow-hidden">
          {merchant?.image ? (
            <img src={merchant.image} alt="Resto" className="w-full h-full object-cover" />
          ) : (
            <Store size={40} className="text-primary" />
          )}
        </div>
        <h1 className="text-2xl font-bold capitalize">{merchant?.name || 'Toko Anda'}</h1>
        <p className="text-slate-500 capitalize">{merchant?.service_type || 'Wira Food & Mart'}</p>
        <div className="flex justify-center items-center gap-2 mt-2">
          <StarRating rating={merchant?.rating || 5.0} /> <span className="font-medium">{merchant?.rating || 5.0}</span>
        </div>
      </div>

      <Card className="p-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-start gap-3">
          <MapPin className="text-slate-400 mt-1" />
          <div>
            <p className="font-semibold">Alamat Resto</p>
            <p className="text-sm text-slate-500">{merchant?.address || 'Alamat belum diatur'}</p>
          </div>
        </div>
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-start gap-3">
          <Clock className="text-slate-400 mt-1" />
          <div>
            <p className="font-semibold">Jam Operasional</p>
            <p className="text-sm text-slate-500">Dapat diatur oleh Admin</p>
          </div>
        </div>
        <div className="p-4 flex items-start gap-3">
          <CreditCard className="text-slate-400 mt-1" />
          <div>
            <p className="font-semibold">Rekening Pencairan</p>
            <p className="text-sm text-slate-500">Saldo WiraPay</p>
          </div>
        </div>
        <Link to="/merchant/settings" className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center gap-3 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          <Settings className="text-slate-400" />
          <span className="font-medium">Pengaturan Akun</span>
        </Link>
      </Card>

      <Button variant="outline" className="w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white" onClick={signOut}>Keluar Akun</Button>
    </div>
  );
};
export default MerchantProfilePage;
