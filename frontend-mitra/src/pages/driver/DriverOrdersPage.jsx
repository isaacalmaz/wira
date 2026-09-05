import React, { useState } from 'react';
import { driverOrders } from '../../data/orders';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import NavigationButton from '../../components/shared/NavigationButton';
import { User, MapPin, Package, Clock } from 'lucide-react';

const DriverOrdersPage = () => {
  const [orders, setOrders] = useState(driverOrders);
  const activeOrder = orders.find(o => o.status !== 'Completed');
  const history = orders.filter(o => o.status === 'Completed');

  const updateStatus = (newStatus) => {
    if(activeOrder) {
      setOrders(orders.map(o => o.id === activeOrder.id ? { ...o, status: newStatus } : o));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pesanan</h1>
      
      {activeOrder ? (
        <Card className="border-primary/50 shadow-md">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <Badge variant="primary">{activeOrder.type}</Badge>
            <span className="font-bold text-lg text-primary">Rp {activeOrder.amount.toLocaleString()}</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><User size={20}/></div>
              <div>
                <p className="font-semibold">{activeOrder.customer}</p>
                <p className="text-sm text-slate-500">{activeOrder.phone}</p>
              </div>
              <Button variant="outline" className="ml-auto rounded-full p-2 h-10 w-10 flex items-center justify-center">💬</Button>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="text-blue-500 mt-1" size={18} />
                <div><p className="text-xs text-slate-500">Jemput</p><p className="font-medium">{activeOrder.pickup}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="text-accent mt-1" size={18} />
                <div><p className="text-xs text-slate-500">Antar</p><p className="font-medium">{activeOrder.destination}</p></div>
              </div>
            </div>

            {activeOrder.type === 'Food' && (
              <div className="text-sm">
                <p className="font-semibold mb-1 flex items-center gap-2"><Package size={16}/> Daftar Pesanan:</p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-400">
                  {activeOrder.items?.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
            
            <NavigationButton destination={activeOrder.status === 'Active' ? activeOrder.pickup : activeOrder.destination} />
            <StatusUpdater currentStatus={activeOrder.status} role="driver" onUpdate={updateStatus} />
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-slate-500">
          <div className="text-4xl mb-2">🏍️</div>
          <p>Belum ada pesanan aktif.</p>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-bold mb-4">Riwayat Hari Ini</h2>
        <div className="space-y-3">
          {history.map(order => (
            <Card key={order.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="gray">{order.type}</Badge>
                  <span className="text-sm font-medium">{order.customer}</span>
                </div>
                <p className="text-xs text-slate-500">{order.pickup} → {order.destination}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">Rp {order.amount.toLocaleString()}</p>
                <Badge variant="success">Selesai</Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DriverOrdersPage;
