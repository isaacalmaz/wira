import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

export default function OTPPage() {
  const [code, setCode] = useState(['','','','','','']);
  const navigate = useNavigate();

  const handleVerify = () => navigate('/login');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center bg-white">
        <h1 className="text-xl font-bold mb-2 text-primary">Verifikasi OTP</h1>
        <p className="text-slate-500 mb-6 text-sm">Kode 6 digit telah dikirim ke nomor Anda</p>
        <div className="flex gap-2 justify-center mb-6">
          {code.map((d, i) => (
            <input key={i} type="text" maxLength={1} className="w-12 h-12 text-center text-xl font-bold border rounded-lg focus:ring-2 focus:ring-primary"
              onChange={(e) => {
                let newCode = [...code]; newCode[i] = e.target.value; setCode(newCode);
              }} />
          ))}
        </div>
        <Button onClick={handleVerify} className="w-full mb-4">Verifikasi</Button>
        <p className="text-sm text-slate-500">Kirim ulang dalam 60s</p>
      </Card>
    </div>
  );
}
