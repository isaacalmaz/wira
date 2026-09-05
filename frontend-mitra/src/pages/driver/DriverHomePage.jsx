import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, BellRing, Target, Activity } from 'lucide-react';
import { Card, Button, Badge } from '../../components/shared/UIComponents';
import OnlineToggle from '../../components/shared/OnlineToggle';
import EarningsCard from '../../components/shared/EarningsCard';
import L from 'leaflet';

// Fix leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DriverHomePage = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(true); // Mock incoming order

  const mataramPos = [-8.5833, 116.1167];

  return (
    <div className="space-y-6 relative pb-20">
      {/* Header & Status */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h1 className="text-xl font-bold">Halo, Budi!</h1>
          <p className="text-sm text-slate-500">{isOnline ? 'Mencari pesanan...' : 'Anda sedang offline'}</p>
        </div>
        <div className="flex flex-col items-end">
          <OnlineToggle isOnline={isOnline} onChange={setIsOnline} />
          <span className={`text-xs mt-1 font-medium ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <EarningsCard today={150000} week={850000} progress={60} />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <Target className="text-primary mb-2" size={28} />
          <span className="text-2xl font-bold">12</span>
          <span className="text-xs text-slate-500">Trip Selesai</span>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <Activity className="text-green-500 mb-2" size={28} />
          <span className="text-2xl font-bold">95%</span>
          <span className="text-xs text-slate-500">Tingkat Penerimaan</span>
        </Card>
      </div>

      {/* Map */}
      <Card className="p-0 h-64 relative z-0">
        {isOnline ? (
          <MapContainer center={mataramPos} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={mataramPos}>
              <Popup>Posisi Anda</Popup>
            </Marker>
          </MapContainer>
        ) : (
          <div className="h-full w-full bg-slate-200 dark:bg-slate-700 flex flex-col items-center justify-center text-slate-400">
            <MapPin size={40} className="mb-2" />
            <p>Peta tidak aktif saat Offline</p>
          </div>
        )}
      </Card>

      {/* Incoming Order Popup */}
      {isOnline && incomingOrder && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <Card className="w-full max-w-sm p-6 bg-white dark:bg-slate-800 border-2 border-primary shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                <BellRing size={32} className="animate-bounce" />
              </div>
              <Badge variant="primary" className="mb-2">Wira Ride</Badge>
              <h2 className="text-2xl font-bold">Rp 25.000</h2>
              <p className="text-slate-500">4.2 km • Est. 12 mnt</p>
            </div>
            
            <div className="space-y-3 mb-6 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-left">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                <div>
                  <p className="text-xs text-slate-500">Jemput</p>
                  <p className="font-medium">Epicentrum Mall</p>
                </div>
              </div>
              <div className="border-l-2 border-dashed border-slate-300 ml-1 h-4 my-1"></div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-accent mt-2"></div>
                <div>
                  <p className="text-xs text-slate-500">Antar</p>
                  <p className="font-medium">Pantai Ampenan</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(false)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={() => { setIncomingOrder(false); window.location.href='/driver/orders'; }}>Terima</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default DriverHomePage;
