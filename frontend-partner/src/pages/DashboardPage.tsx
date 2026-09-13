import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Car, Store, LogOut } from 'lucide-react';
import { supabase } from '../config/supabase';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
        return;
      }
      setUser(session.user);
    });
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Keluar berhasil');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">WiraPartner</h1>
            <p className="text-xs text-slate-500">{user?.email || 'Mitra'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 max-w-lg mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Pilih Mode Kerja</h2>
        <p className="text-slate-500 text-sm mb-6">Pilih mode sesuai layanan yang Anda sediakan</p>

        <div className="grid grid-cols-1 gap-4">
          {/* Driver Mode */}
          <button
            onClick={() => navigate('/driver')}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white rounded-2xl p-6 text-left shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className="bg-blue-500 rounded-xl p-3">
                <Car className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Driver Mode</h3>
                <p className="text-blue-200 text-sm mt-1">WiraRide & WiraSend</p>
                <p className="text-blue-100 text-xs mt-1">Layanan antar jemput & pengiriman</p>
              </div>
            </div>
          </button>

          {/* Merchant Mode */}
          <button
            onClick={() => navigate('/merchant')}
            className="bg-orange-600 hover:bg-orange-700 active:scale-95 transition-all text-white rounded-2xl p-6 text-left shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className="bg-orange-500 rounded-xl p-3">
                <Store className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Merchant Mode</h3>
                <p className="text-orange-200 text-sm mt-1">WiraFood & WiraVilla</p>
                <p className="text-orange-100 text-xs mt-1">Layanan makanan & penginapan</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 bg-white rounded-xl p-4 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-2">📊 Status Akun</h3>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-slate-600">Akun aktif & siap menerima pesanan</span>
          </div>
        </div>
      </div>
    </div>
  );
}
