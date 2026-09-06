import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/shared/UIComponents';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';

// Kompres gambar otomatis agar ringan di cloud Supabase
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const RegisterPage = () => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('driver');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    vehicle: '',
    plate: '',
    restaurantName: '',
    address: '',
    specialization: 'ac',
    experience: '1',
    simPhoto: null,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFormData((prev) => ({ ...prev, simPhoto: compressed }));
        toast.success('Foto dokumen berhasil dipilih & dikompres!', { icon: '📸' });
      } catch (err) {
        toast.error('Gagal memproses foto');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 4) {
      setStep(step + 1);
    } else {
      setLoading(true);
      const newMitra = {
        id: `MTR-${Date.now().toString().slice(-6)}`,
        role: role,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        vehicle: role === 'driver' ? formData.vehicle : null,
        plate: role === 'driver' ? formData.plate : null,
        sim_photo: formData.simPhoto || null,
        restaurant_name: role === 'merchant' ? formData.restaurantName : null,
        address: role === 'merchant' ? formData.address : null,
        specialization: role === 'technician' ? formData.specialization : null,
        experience: role === 'technician' ? formData.experience : null,
        status: 'Pending',
        created_at: new Date().toISOString(),
      };

      // 1. Simpan ke Supabase Cloud
      try {
        const { data, error: fetchErr } = await supabase
          .from('feature_flags')
          .select('id, features')
          .eq('region', 'mitra_registrations')
          .maybeSingle();

        if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

        const currentList = Array.isArray(data?.features) ? data.features : [];
        const updatedList = [newMitra, ...currentList.filter((m) => m.id !== newMitra.id)];

        if (data) {
          const { error: updateErr } = await supabase
            .from('feature_flags')
            .update({ features: updatedList, updated_at: new Date().toISOString() })
            .eq('region', 'mitra_registrations');
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('feature_flags')
            .insert([{ region: 'mitra_registrations', features: updatedList, updated_at: new Date().toISOString() }]);
          if (insertErr) throw insertErr;
        }
      } catch (cloudErr) {
        console.error('Cloud sync error:', cloudErr);
        toast.error(`Gagal sinkronisasi cloud: ${cloudErr.message || 'Error tidak diketahui'}`);
      }

      // 2. Simpan juga ke mitra_registrations jika tabel sudah dibuat
      try {
        await supabase.from('mitra_registrations').insert([newMitra]);
      } catch (e) {}

      // 3. Simpan ke LocalStorage & broadcast untuk sinkronisasi lokal
      try {
        const existing = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
        localStorage.setItem('wira_mitra_registrations', JSON.stringify([newMitra, ...existing]));
        
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('wira_mitra_channel');
          bc.postMessage({ type: 'NEW_MITRA', data: newMitra });
          bc.close();
        }
      } catch (storageErr) {
        console.warn('Storage sync warn:', storageErr);
      } finally {
        setLoading(false);
        toast.success('Pendaftaran berhasil dikirim!');
        navigate('/pending-verification');
      }
    }
  };

  return (
    <div className="min-h-screen p-4 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Card className="w-full max-w-lg p-6">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">Daftar Mitra Wira</h1>
        <div className="flex justify-between mb-6 px-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                step >= i ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
              }`}
            >
              {i}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg dark:text-white">Pilih Jenis Mitra</h2>
              {[
                { id: 'driver', title: 'Driver (Ojek & Mobil)', desc: 'Antar penumpang & makanan di Lombok' },
                { id: 'merchant', title: 'Merchant (Restoran/Warung)', desc: 'Jual makanan khas Lombok di WiraFood' },
                { id: 'technician', title: 'Teknisi & Jasa', desc: 'Layanan AC, listrik, tukang, & kolam renang' },
              ].map((r) => (
                <label
                  key={r.id}
                  className={`block p-4 border rounded-xl cursor-pointer transition-all ${
                    role === r.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary dark:border-primary'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.id}
                    checked={role === r.id}
                    onChange={() => setRole(r.id)}
                    className="hidden"
                  />
                  <span className="font-bold block text-lg dark:text-white">{r.title}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{r.desc}</span>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg dark:text-white">Data Pribadi</h2>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Nama Lengkap"
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                required
              />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Nomor Handphone (WhatsApp)"
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                required
              />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Alamat Email"
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                required
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-lg dark:text-white">
                {role === 'driver' ? 'Data Kendaraan' : role === 'merchant' ? 'Data Restoran / Warung' : 'Keahlian'}
              </h2>
              {role === 'driver' && (
                <>
                  <input
                    type="text"
                    name="vehicle"
                    value={formData.vehicle}
                    onChange={handleChange}
                    placeholder="Tipe Kendaraan (cth: Honda Vario 160)"
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    name="plate"
                    value={formData.plate}
                    onChange={handleChange}
                    placeholder="Plat Nomor (cth: DR 1234 AB)"
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    required
                  />
                  {/* Upload Foto SIM & STNK */}
                  <div>
                    <input
                      type="file"
                      id="sim-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    {formData.simPhoto ? (
                      <div className="relative p-3 border-2 border-green-500 bg-green-50 dark:bg-green-950/20 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={formData.simPhoto}
                            alt="Preview SIM"
                            className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                          />
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                              Foto SIM Berhasil Dipilih ✓
                            </p>
                            <p className="text-xs text-slate-500">Klik tombol di samping untuk mengganti</p>
                          </div>
                        </div>
                        <label
                          htmlFor="sim-upload"
                          className="cursor-pointer text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-50 text-slate-700 dark:text-slate-200"
                        >
                          Ganti
                        </label>
                      </div>
                    ) : (
                      <label
                        htmlFor="sim-upload"
                        className="cursor-pointer block p-6 border-2 border-dashed border-cyan-400 hover:border-cyan-600 dark:border-cyan-800 dark:hover:border-cyan-600 bg-cyan-50/50 dark:bg-cyan-950/10 rounded-xl text-center transition-all group"
                      >
                        <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          📸
                        </div>
                        <p className="font-semibold text-sm text-cyan-900 dark:text-cyan-300">
                          Klik untuk Upload Foto SIM & STNK
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Mendukung format JPG, PNG, atau ambil langsung dari kamera HP
                        </p>
                      </label>
                    )}
                  </div>
                </>
              )}
              {role === 'merchant' && (
                <>
                  <input
                    type="text"
                    name="restaurantName"
                    value={formData.restaurantName}
                    onChange={handleChange}
                    placeholder="Nama Restoran / Rumah Makan"
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    required
                  />
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Alamat Lengkap di Mataram/Lombok"
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    rows="3"
                    required
                  ></textarea>
                </>
              )}
              {role === 'technician' && (
                <>
                  <select
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleChange}
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    required
                  >
                    <option value="AC & Pendingin">AC & Pendingin</option>
                    <option value="Instalasi Listrik">Instalasi Listrik</option>
                    <option value="Pipa & Pompa Air">Pipa & Pompa Air</option>
                    <option value="Tukang Bangunan">Tukang Bangunan</option>
                    <option value="Maintenance Kolam Renang">Maintenance Kolam Renang</option>
                  </select>
                  <input
                    type="number"
                    name="experience"
                    value={formData.experience}
                    onChange={handleChange}
                    placeholder="Pengalaman Kerja (Tahun)"
                    className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    required
                  />
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 py-4 dark:text-white">
              <h2 className="font-bold text-xl text-center">Konfirmasi Pendaftaran</h2>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl space-y-2 text-sm">
                <p><span className="text-slate-500">Peran:</span> <strong className="capitalize">{role}</strong></p>
                <p><span className="text-slate-500">Nama:</span> <strong>{formData.name}</strong></p>
                <p><span className="text-slate-500">No. HP:</span> <strong>{formData.phone}</strong></p>
                <p><span className="text-slate-500">Email:</span> <strong>{formData.email}</strong></p>
                {role === 'driver' && (
                  <>
                    <p><span className="text-slate-500">Kendaraan:</span> <strong>{formData.vehicle} ({formData.plate})</strong></p>
                    {formData.simPhoto && (
                      <div className="pt-2 flex items-center gap-3">
                        <span className="text-slate-500">Foto Dokumen:</span>
                        <img src={formData.simPhoto} alt="SIM Preview" className="w-12 h-12 object-cover rounded-md border" />
                      </div>
                    )}
                  </>
                )}
                {role === 'merchant' && (
                  <p><span className="text-slate-500">Restoran:</span> <strong>{formData.restaurantName}</strong></p>
                )}
                {role === 'technician' && (
                  <p><span className="text-slate-500">Keahlian:</span> <strong>{formData.specialization} ({formData.experience} thn)</strong></p>
                )}
              </div>
              <p className="text-xs text-slate-500 text-center">
                Data akan langsung terkirim ke Admin Wira untuk proses verifikasi.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
                Kembali
              </Button>
            )}
            <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
              {loading ? 'Mengirim...' : step === 4 ? 'Kirim Pendaftaran' : 'Lanjut'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default RegisterPage;
