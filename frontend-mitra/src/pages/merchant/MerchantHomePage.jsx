import React, { useState } from 'react';
import { Card, Badge, Button } from '../../components/shared/UIComponents';
import { merchantOrders } from '../../data/orders';
import { Store, TrendingUp, ShoppingBag, BellRing } from 'lucide-react';
import OnlineToggle from '../../components/shared/OnlineToggle';

const MerchantHomePage = () => {
  const [isOpen, setIsOpen] = useState(true);
  const incoming = merchantOrders.filter(o => o.status === 'Incoming');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg"><Store className="text-primary" /></div>
          <div>
            <h1 className="text-lg font-bold">Warung Sasak</h1>
            <p className="text-sm text-slate-500">{isOpen ? 'Toko Buka' : 'Toko Tutup'}</p>
          </div>
        </div>
        <OnlineToggle isOnline={isOpen} onChange={setIsOpen} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-500 to-primary text-white border-none">
          <p className="text-blue-100 text-sm">Pesanan Hari Ini</p>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <ShoppingBag size={20} />
            <h2 className="text-3xl font-bold">24</h2>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white border-none">
          <p className="text-green-100 text-sm">Pendapatan</p>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <TrendingUp size={20} />
            <h2 className="text-2xl font-bold">Rp 1.2M</h2>
          </div>
        </Card>
      </div>

      {isOpen && incoming.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            Pesanan Baru <Badge variant="danger" className="animate-pulse">{incoming.length}</Badge>
          </h2>
          <div className="space-y-3">
            {incoming.map(order => (
              <Card key={order.id} className="p-4 border-2 border-accent shadow-md bg-accent/5 dark:bg-accent/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 text-accent"><BellRing size={20} className="animate-bounce" /></div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{order.id}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{order.customer} • {order.time}</p>
                  </div>
                  <span className="font-bold text-primary">Rp {order.total.toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg mb-4 text-sm">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                      <span>{item.qty}x {item.name}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">Tolak</Button>
                  <Button variant="primary" className="flex-1">Terima Pesanan</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default MerchantHomePage;
