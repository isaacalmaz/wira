import { useState } from 'react';
import { useCart } from '../context/CartContext';
import { RESTAURANTS } from '../data/restaurants';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { Star, Clock, Minus, Plus, ShoppingBag } from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';

export default function RestaurantPage({ id = 1 }) { // Mocking the router param
  const rest = RESTAURANTS.find(r => r.id === id);
  const { cart, addItem, total } = useCart();
  const [step, setStep] = useState('menu');

  if (!rest) return <div>Restoran tidak ditemukan</div>;

  return (
    <div className="space-y-4 pb-20">
      <Card className="overflow-hidden">
        <div className="h-40 bg-slate-200">
          <img src={rest.image} alt={rest.name} className="w-full h-full object-cover" />
        </div>
        <div className="p-4">
          <h1 className="text-xl font-bold dark:text-white">{rest.name}</h1>
          <div className="flex gap-4 text-sm text-slate-500 mt-2">
            <span className="flex items-center gap-1 text-orange-500"><Star size={16} fill="currentColor"/> {rest.rating}</span>
            <span className="flex items-center gap-1"><Clock size={16}/> {rest.deliveryTime}</span>
          </div>
        </div>
      </Card>

      {step === 'menu' && (
        <div className="space-y-4">
          <h2 className="font-bold text-lg dark:text-white">Menu Pilihan</h2>
          {rest.menuItems.map(item => (
            <Card key={item.id} className="p-4 flex gap-4">
              <div className="flex-1">
                <h3 className="font-semibold dark:text-white">{item.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-2">{item.description}</p>
                <p className="font-bold text-primary">{formatRupiah(item.price)}</p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <div className="w-20 h-20 bg-slate-200 rounded-lg"></div>
                <Button size="sm" className="mt-2" onClick={() => addItem({ ...item, qty: 1 })}>Tambah</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {step === 'tracking' && (
        <Card className="p-6 text-center space-y-4 mt-8">
          <div className="w-16 h-16 bg-primary text-white rounded-full mx-auto flex items-center justify-center"><ShoppingBag size={32} /></div>
          <h2 className="text-xl font-bold dark:text-white">Pesanan Dikonfirmasi</h2>
          <p className="text-slate-500">Driver sedang menuju restoran untuk mengambil pesanan Anda.</p>
          <div className="space-y-2 mt-4 text-left">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-primary rounded-full"></div><span className="text-sm dark:text-white">Menunggu Konfirmasi</span></div>
            <div className="w-0.5 h-4 bg-primary ml-1.5"></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-primary rounded-full"></div><span className="text-sm dark:text-white">Pesanan Disiapkan</span></div>
          </div>
        </Card>
      )}

      {cart.items.length > 0 && step === 'menu' && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-800 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex justify-between items-center md:max-w-4xl md:mx-auto">
          <div>
            <p className="text-sm text-slate-500">{cart.items.length} Item</p>
            <p className="font-bold text-lg dark:text-white">{formatRupiah(total)}</p>
          </div>
          <Button onClick={() => setStep('tracking')}>Checkout</Button>
        </div>
      )}
    </div>
  );
}
