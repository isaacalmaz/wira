import React from 'react';
import { Card, Button } from '../components/shared/UIComponents';
import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PendingVerificationPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto">
          <Clock size={48} />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">Menunggu Verifikasi</h1>
          <p className="text-slate-500">Akun Anda sedang diverifikasi oleh admin Wira. Proses ini memakan waktu maksimal 1x24 jam kerja.</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>Kembali ke Login</Button>
      </Card>
    </div>
  );
};
export default PendingVerificationPage;
