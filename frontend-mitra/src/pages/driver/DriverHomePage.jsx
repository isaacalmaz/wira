import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, BellRing, Target, Activity } from 'lucide-react';
import { Card, Button, Badge } from '../../components/shared/UIComponents';
import OnlineToggle from '../../components/shared/OnlineToggle';
import EarningsCard from '../../components/shared/EarningsCard';
import L from 'leaflet';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DriverHomePage = () => {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null); // Jika sedang menjalankan order

  const mataramPos = [-8.5833, 116.1167];

  useEffect(() => {
    if (!isOnline) {
      setIncomingOrder(null);
      return;
    }

    // Dengarkan orderan baru dari tabel 'orders'
    const channel = supabase
      .channel('driver-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          // Hanya tangkap jika orderan pending & belum ada orderan yang diproses
          if (payload.new.status === 'pending' && !activeOrder) {
            setIncomingOrder(payload.new);
            toast.success('Pesanan Baru Masuk!', { icon: '🔔' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnline, activeOrder]);

  const handleAcceptOrder = async () => {
    if (!incomingOrder) return;
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'accepted', driver_id: user?.id })
        .eq('id', incomingOrder.id);
        
      if (error) throw error;

      setActiveOrder(incomingOrder);
      setIncomingOrder(null);
      toast.success('Berhasil mengambil pesanan!');
    } catch (err) {
      toast.error('Gagal mengambil pesanan. Mungkin sudah diambil driver lain.');
      setIncomingOrder(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (!activeOrder) return;
    try {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', activeOrder.id);
      
      setActiveOrder(null);
      toast.success('Perjalanan diselesaikan!');
    } catch (err) {
      toast.error('Gagal menyelesaikan pesanan');
    }
  };

  return (
    <div className="space-y-6 relative pb-20">
      {/* Header & Status */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div>
          <h1 className="text-xl font-bold">Halo, {user?.name || 'Driver'}!</h1>
          <p className="text-sm text-slate-500">
            {activeOrder ? 'Sedang Mengantar...' : (isOnline ? 'Mencari pesanan...' : 'Anda offline')}
          </p>
        </div>
        {!activeOrder && (
          <div className="flex flex-col items-end">
            <OnlineToggle isOnline={isOnline} onChange={setIsOnline} />
            <span className={`text-xs mt-1 font-medium ${isOnline ? 'text-green-500' : 'text-slate-400'}`}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        )}
      </div>

      {!activeOrder ? (
        <>
          <EarningsCard today={150000} week={850000} progress={60} />
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
        </>
      ) : (
        <Card className="p-5 border-2 border-primary space-y-4 shadow-lg animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
              <MapPin size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Pesanan Sedang Berjalan</h3>
              <p className="text-sm text-slate-500">Order ID: {activeOrder.id.slice(0,8)}</p>
            </div>
          </div>
          <div className="flex justify-between items-center text-xl font-bold pt-2">
            <span>Total Tagihan:</span>
            <span className="text-primary">Rp {activeOrder.total_price.toLocaleString('id-ID')}</span>
          </div>
          <Button variant="primary" className="w-full font-bold" onClick={handleCompleteOrder}>
            Selesaikan Perjalanan
          </Button>
        </Card>
      )}

      {/* Map */}
      <Card className="p-0 h-64 relative z-0">
        {isOnline || activeOrder ? (
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
              <Badge variant="primary" className="mb-2 capitalize">{incomingOrder.service_type}</Badge>
              <h2 className="text-2xl font-bold">Rp {incomingOrder.total_price.toLocaleString('id-ID')}</h2>
              <p className="text-slate-500">Estimasi Jemput: 5 mnt</p>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptOrder}>Terima</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
export default DriverHomePage;
