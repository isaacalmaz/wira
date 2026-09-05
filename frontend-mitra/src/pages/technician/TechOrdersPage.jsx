import React, { useState } from 'react';
import { techOrders } from '../../data/orders';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import NavigationButton from '../../components/shared/NavigationButton';
import { MapPin, Clock, Camera } from 'lucide-react';

const TechOrdersPage = () => {
  const [orders, setOrders] = useState(techOrders);
  const activeOrder = orders.find(o => o.status !== 'Completed' && o.status !== 'Incoming');

  const updateStatus = (newStatus) => {
    if(activeOrder) setOrders(orders.map(o => o.id === activeOrder.id ? { ...o, status: newStatus } : o));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pekerjaan Aktif</h1>
      
      {activeOrder ? (
        <Card className="p-4 border-primary/50 shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <Badge variant="primary" className="mb-2">{activeOrder.type}</Badge>
              <h3 className="font-bold text-lg">{activeOrder.desc}</h3>
              <p className="text-sm font-medium mt-1">Klien: {activeOrder.customer}</p>
            </div>
            <span className="font-bold text-primary">~Rp {activeOrder.estPrice.toLocaleString()}</span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg space-y-2 mb-4">
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={16} className="text-slate-400 mt-0.5" />
              <span>{activeOrder.address}</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Clock size={16} className="text-slate-400 mt-0.5" />
              <span>{activeOrder.schedule}</span>
            </div>
          </div>

          <NavigationButton destination={activeOrder.address} />
          
          {activeOrder.status === 'Working' && (
             <div className="mt-4 p-4 border-2 border-dashed border-slate-300 rounded-lg text-center cursor-pointer hover:bg-slate-50">
               <Camera size={24} className="mx-auto text-slate-400 mb-2" />
               <p className="text-sm font-medium">Upload Foto Hasil Pekerjaan</p>
             </div>
          )}

          <div className="mt-4">
            <StatusUpdater currentStatus={activeOrder.status} role="technician" onUpdate={updateStatus} />
          </div>
        </Card>
      ) : (
        <div className="text-center py-10 text-slate-500">Tidak ada pekerjaan aktif saat ini.</div>
      )}
    </div>
  );
};
export default TechOrdersPage;
