import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/shared/UIComponents';

export default function UnauthorizedPage() {
  const { logout } = useAuth();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Akses Ditolak</h1>
        <p className="text-slate-500 mb-6">Akun Anda tidak terdaftar sebagai Mitra (Driver/Merchant/Teknisi). Silakan mendaftar terlebih dahulu atau gunakan akun lain.</p>
        <Button variant="primary" className="w-full" onClick={logout}>Keluar</Button>
      </div>
    </div>
  );
}
