import React, { useState } from 'react';
import { merchantOrders } from '../../data/orders';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import StatusUpdater from '../../components/shared/StatusUpdater';
import { Clock } from 'lucide-react';

const MerchantOrdersPage = () => {
  const [orders, setOrders] = useState(merchantOrders);
  const [tab, setTab] = useState('active');

  const updateStatus = (id, newStatus) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const filteredOrders = orders.filter(o => tab === 'active' ? o.status !== 'Completed' : o.status === 'Completed');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Daftar Pesanan</h1>

      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-4">
        <button onClick={() => setTab('active')} className={`flex-1 py-2 text-sm font-medium rounded-md ${tab === 'active' ? 'bg-white dark:bg-slate-800 shadow text-primary' : 'text-slate-500'}`}>Aktif</button>
        <button onClick={() => setTab('history')} className={`flex-1 py-2 text-sm font-medium rounded-md ${tab === 'history' ? 'bg-white dark:bg-slate-800 shadow text-primary' : 'text-slate-500'}`}>Riwayat</button>
      </div>

      <div className="space-y-4">
        {filteredOrders.length > 0 ? filteredOrders.map(order => (
          <Card key={order.id} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <Badge variant={order.status === 'Incoming' ? 'danger' : 'primary'} className="mb-1">{order.status}</Badge>
                <h3 className="font-bold">{order.id}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1"><Clock size={14}/> {order.time} • {order.customer}</p>
              </div>
              <span className="font-bold text-lg text-primary">Rp {order.total.toLocaleString()}</span>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg mb-4 space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="font-medium">{item.qty}x {item.name}</span>
                </div>
              ))}
            </div>

            {tab === 'active' && (
              <StatusUpdater currentStatus={order.status} role="merchant" onUpdate={(s) => updateStatus(order.id, s)} />
            )}
          </Card>
        )) : (
          <div className="text-center py-10 text-slate-500">Tidak ada pesanan.</div>
        )}
      </div>
    </div>
  );
};
export default MerchantOrdersPage;
