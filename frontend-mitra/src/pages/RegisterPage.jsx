import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/shared/UIComponents';

const RegisterPage = () => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('driver');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if(step < 4) setStep(step + 1);
    else navigate('/pending-verification');
  };

  return (
    <div className="min-h-screen p-4 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Card className="w-full max-w-lg p-6">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">Daftar Mitra Wira</h1>
        <div className="flex justify-between mb-6 px-4">
          {[1,2,3,4].map(i => (
            <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= i ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500'}`}>{i}</div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Pilih Jenis Mitra</h2>
              {['driver', 'merchant', 'technician'].map(r => (
                <label key={r} className={`block p-4 border rounded-xl cursor-pointer ${role === r ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200'}`}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="hidden"/>
                  <span className="font-bold capitalize block text-lg">{r}</span>
                  <span className="text-sm text-slate-500">Daftar sebagai {r} di Wira.</span>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">Data Pribadi</h2>
              <input type="text" placeholder="Nama Lengkap" className="w-full p-3 rounded-lg border border-slate-300 dark:bg-slate-700" required />
              <input type="tel" placeholder="Nomor Handphone" className="w-full p-3 rounded-lg border border-slate-300 dark:bg-slate-700" required />
              <input type="email" placeholder="Email" className="w-full p-3 rounded-lg border border-slate-300 dark:bg-slate-700" required />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg">{role === 'driver' ? 'Data Kendaraan' : role === 'merchant' ? 'Data Resto' : 'Keahlian'}</h2>
              {role === 'driver' && (
                <>
                  <input type="text" placeholder="Tipe Kendaraan (cth: Honda Vario)" className="w-full p-3 rounded-lg border" required />
                  <input type="text" placeholder="Plat Nomor" className="w-full p-3 rounded-lg border" required />
                  <div className="p-6 border-2 border-dashed rounded-xl text-center text-slate-500">Upload Foto SIM</div>
                </>
              )}
              {role === 'merchant' && (
                <>
                  <input type="text" placeholder="Nama Restoran / Toko" className="w-full p-3 rounded-lg border" required />
                  <textarea placeholder="Alamat Lengkap" className="w-full p-3 rounded-lg border" required></textarea>
                </>
              )}
              {role === 'technician' && (
                <>
                  <select className="w-full p-3 rounded-lg border dark:bg-slate-700" required>
                    <option value="">Pilih Spesialisasi...</option>
                    <option value="ac">AC & Pendingin</option>
                    <option value="listrik">Kelistrikan</option>
                    <option value="plumbing">Pipa & Air</option>
                  </select>
                  <input type="number" placeholder="Pengalaman (Tahun)" className="w-full p-3 rounded-lg border" required />
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4 py-6">
              <h2 className="font-bold text-xl">Review Data</h2>
              <p className="text-slate-500">Pastikan semua data sudah benar sebelum mengirimkan pendaftaran.</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {step > 1 && <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step-1)}>Kembali</Button>}
            <Button type="submit" variant="primary" className="flex-1">{step === 4 ? 'Kirim Pendaftaran' : 'Lanjut'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
export default RegisterPage;
