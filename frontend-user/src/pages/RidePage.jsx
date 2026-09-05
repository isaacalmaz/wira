import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, Navigation, Car, Shield } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';

export default function RidePage() {
  const [step, setStep] = useState('input'); // input, vehicle, searching, tracking
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const vehicles = [
    { id: 'bike', name: 'WiraMotor', price: 15000, time: '3 min', icon: '🛵' },
    { id: 'car', name: 'WiraMobil', price: 35000, time: '5 min', icon: '🚗' },
    { id: 'xl', name: 'WiraMobil XL', price: 50000, time: '8 min', icon: '🚙' }
  ];

  const handleSearch = () => {
    if (pickup && dropoff) setStep('vehicle');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Map Area */}
      <div className="flex-1 bg-slate-200 relative rounded-xl overflow-hidden mb-4 shadow-inner min-h-[250px]">
        <MapContainer center={[APP_CONFIG.defaultLocation.lat, APP_CONFIG.defaultLocation.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[APP_CONFIG.defaultLocation.lat, APP_CONFIG.defaultLocation.lng]}>
            <Popup>Mataram, NTB</Popup>
          </Marker>
        </MapContainer>
        {step === 'input' && (
          <div className="absolute top-4 left-4 right-4 z-[400]">
            <Card className="p-4 space-y-3 bg-white/95 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="w-6 flex justify-center text-green-500"><Navigation size={18} /></div>
                <input 
                  type="text" placeholder="Lokasi Penjemputan" 
                  className="flex-1 bg-slate-50 border-0 rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary dark:bg-slate-700 dark:text-white"
                  value={pickup} onChange={(e) => setPickup(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 flex justify-center text-red-500"><MapPin size={18} /></div>
                <input 
                  type="text" placeholder="Tujuan Anda" 
                  className="flex-1 bg-slate-50 border-0 rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary dark:bg-slate-700 dark:text-white"
                  value={dropoff} onChange={(e) => setDropoff(e.target.value)}
                />
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Action Area */}
      <div className="shrink-0 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden">
        {step === 'input' && (
          <div className="p-4">
            <h3 className="font-semibold mb-3 dark:text-white">Pilih Tujuan Favorit</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['Epicentrum Mall', 'Bandara Lombok', 'Senggigi'].map(loc => (
                <button key={loc} onClick={() => setDropoff(loc)} className="whitespace-nowrap px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-sm hover:bg-slate-200 dark:text-white">
                  {loc}
                </button>
              ))}
            </div>
            <Button className="w-full mt-4" onClick={handleSearch} disabled={!pickup || !dropoff}>Lanjut Pilih Kendaraan</Button>
          </div>
        )}

        {step === 'vehicle' && (
          <div className="p-4">
            <h3 className="font-semibold mb-3 dark:text-white">Pilih Kendaraan</h3>
            <div className="space-y-3 mb-4">
              {vehicles.map(v => (
                <div key={v.id} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-600 rounded-xl hover:border-primary cursor-pointer active:bg-slate-50 dark:active:bg-slate-700">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{v.icon}</span>
                    <div>
                      <h4 className="font-medium dark:text-white">{v.name}</h4>
                      <p className="text-xs text-slate-500">{v.time} • <Shield size={10} className="inline text-green-500"/> Terlindungi asuransi</p>
                    </div>
                  </div>
                  <span className="font-bold dark:text-white">{formatRupiah(v.price)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('input')}>Kembali</Button>
              <Button className="flex-1" onClick={() => setStep('searching')}>Pesan Sekarang</Button>
            </div>
          </div>
        )}

        {step === 'searching' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="font-semibold text-lg dark:text-white">Mencari Driver...</h3>
            <p className="text-slate-500 text-sm mt-2">Mohon tunggu sebentar, kami mencarikan driver terdekat untuk Anda.</p>
            <Button variant="danger" className="mt-6 w-full" onClick={() => setStep('input')}>Batal</Button>
          </div>
        )}
      </div>
    </div>
  );
}
