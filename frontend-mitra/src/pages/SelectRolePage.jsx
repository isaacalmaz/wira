import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Car, Store, Wrench, LogOut } from 'lucide-react';
import { Button } from '../components/shared/UIComponents';
import { Navigate } from 'react-router-dom';

const SelectRolePage = () => {
  const { user, mitraAccess, setActiveRole, logout } = useAuth();

  // Jika tidak punya akses mitra sama sekali, langsung lempar ke Unauthorized
  if (!mitraAccess || mitraAccess.length === 0) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Jika sudah punya activeRole, App.jsx harusnya tidak render komponen ini, tapi jaga-jaga
  if (mitraAccess.length === 1) {
    setActiveRole(mitraAccess[0]);
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
      <div className="max-w-md w-full text-center mb-8">
        <h1 className="text-3xl font-black text-primary mb-2">Halo, {user?.name}!</h1>
        <p className="text-slate-500">Anda memiliki beberapa akses mitra. Silakan pilih dasbor yang ingin Anda buka saat ini.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full">
        {mitraAccess.includes('driver') && (
          <button 
            onClick={() => setActiveRole('driver')}
            className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-lg hover:border-blue-500 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Car size={32} className="text-blue-600" />
            </div>
            <span className="font-bold text-slate-800">WiraRide / Send</span>
            <span className="text-xs text-slate-500 text-center">Dasbor Pengemudi & Kurir</span>
          </button>
        )}
        
        {mitraAccess.includes('merchant') && (
          <button 
            onClick={() => setActiveRole('merchant')}
            className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-lg hover:border-amber-500 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Store size={32} className="text-amber-600" />
            </div>
            <span className="font-bold text-slate-800">WiraFood / Shop</span>
            <span className="text-xs text-slate-500 text-center">Dasbor Restoran & Toko</span>
          </button>
        )}

        {mitraAccess.includes('technician') && (
          <button 
            onClick={() => setActiveRole('technician')}
            className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-lg hover:border-emerald-500 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wrench size={32} className="text-emerald-600" />
            </div>
            <span className="font-bold text-slate-800">WiraService</span>
            <span className="text-xs text-slate-500 text-center">Dasbor Jasa & Tukang</span>
          </button>
        )}
      </div>

      <div className="mt-10">
        <Button variant="ghost" onClick={logout} className="text-red-500 flex items-center gap-2">
          <LogOut size={18} /> Keluar Akun
        </Button>
      </div>
    </div>
  );
};

export default SelectRolePage;
