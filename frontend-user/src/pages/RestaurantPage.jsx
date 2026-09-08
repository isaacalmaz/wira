import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { supabase } from '../config/supabase';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import {
  Star,
  Clock,
  Minus,
  Plus,
  ShoppingBag,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  Tag,
  X,
  Bike,
} from 'lucide-react';
import { formatRupiah } from '../utils/formatRupiah';
import { toast } from 'react-hot-toast';

export default function RestaurantPage() {
  const { id } = useParams();
  const [rest, setRest] = useState(null);
  
  const { cart, addItem, removeItem, total, clearCart } = useCart();
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [step, setStep] = useState('menu'); // 'menu', 'checkout', 'tracking'
  const [deliveryAddress, setDeliveryAddress] = useState('Jl. Pejanggik No. 8, Mataram');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trackingStage, setTrackingStage] = useState(1);

  useEffect(() => {
    const fetchRest = async () => {
      // Ambil data restoran
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', id)
        .single();
        
      if (merchantData) {
        // Ambil data menu (products)
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('merchant_id', id);
          
        setRest({
          ...merchantData,
          deliveryTime: merchantData.delivery_time,
          menuItems: productsData || []
        });
      }
    };
    if (id) fetchRest();
  }, [id]);


  const [activeOrderId, setActiveOrderId] = useState(null);

  useEffect(() => {
    if (!activeOrderId) return;

    const channel = supabase
      .channel(`order_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${activeOrderId}` },
        (payload) => {
          const newStatus = payload.new.status;
          
          if (newStatus === 'accepted') {
            setTrackingStage(1);
            toast.success(`Pesanan Anda diterima oleh restoran!`, { icon: '🍲' });
          } 
          else if (newStatus === 'completed') {
            handleCompleteFood();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  // Simulasi Masak & Antar HANYA JIKA SUDAH ACCEPTED (stage 1+)
  useEffect(() => {
    if (step === 'tracking' && trackingStage >= 1) {
      if (trackingStage === 1) {
        const t = setTimeout(() => setTrackingStage(2), 5000);
        return () => clearTimeout(t);
      } else if (trackingStage === 2) {
        const t = setTimeout(() => setTrackingStage(3), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [step, trackingStage]);

  if (!rest) {
    return <div className="p-10 text-center animate-pulse">Memuat data restoran...</div>;
  }

  const deliveryFee = 8000;
  const grandTotal = Math.max(0, total + deliveryFee - discount);

  const handleApplyPromo = () => {
    if (promoCode.toUpperCase() === 'WIRALOMBOK' || promoCode.toUpperCase() === 'DISKON10') {
      setDiscount(10000);
      toast.success('Voucher WIRALOMBOK Berhasil Digunakan! Diskon Rp 10.000', { icon: '🎉' });
    } else {
      toast.error('Kode promo tidak valid');
    }
  };

  
  const handleConfirmOrder = async () => {
    if (cart.items.length === 0) {
      toast.error('Keranjang Anda masih kosong');
      return;
    }
    if (paymentMethod === 'WiraPay' && balance < grandTotal) {
      toast.error('Saldo WiraPay Anda tidak mencukupi untuk pembayaran ini');
      return;
    }

    setLoading(true);
    try {
      const itemsSummary = cart.items.map((i) => `${i.qty}x ${i.name}`).join(', ');

      const order = await addOrder({
        serviceType: 'food',
        merchantId: rest.id, // ID Restoran!
        title: rest.name,
        details: itemsSummary,
        price: grandTotal,
        paymentMethod: paymentMethod,
      });

      setActiveOrderId(order.id);
      clearCart();
      setStep('tracking'); 
      setTrackingStage(0); // 0 = Menunggu Konfirmasi Restoran
      toast.success('Menunggu konfirmasi dari restoran...');
    } catch (err) {
      toast.error(err.message || 'Pemesanan gagal');
    }
    setLoading(false);
  };

  
  
  const handleCompleteFood = async () => {
    try {
      if (paymentMethod === 'WiraPay') {
        await pay(grandTotal, `WiraFood - ${rest.name}`);
      }
      setStep('menu');
      toast.success('Makanan telah diterima. Selamat menikmati!');
    } catch (err) {
      toast.error('Gagal menyelesaikan pembayaran WiraPay');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-28">
      {/* Header Banner Restoran */}
      <div className="relative">
        <Link
          to="/food"
          className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-md hover:scale-105 transition"
        >
          <ArrowLeft size={18} />
        </Link>
        <Card className="overflow-hidden p-0 border border-slate-200 dark:border-slate-700">
          <div className="h-48 bg-slate-200 relative overflow-hidden">
            <img
              src={rest.image}
              alt={rest.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <span className="text-[11px] font-bold uppercase bg-primary px-2.5 py-1 rounded-full mb-1 inline-block">
                {rest.category}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                {rest.name}
              </h1>
              <p className="text-xs text-slate-200 flex items-center gap-1 mt-1">
                <MapPin size={12} /> {rest.address}
              </p>
            </div>
          </div>
          <div className="p-3 bg-white dark:bg-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 font-bold text-amber-500">
              <Star size={15} fill="currentColor" /> {rest.rating} (500+ Ulasan)
            </span>
            <span className="flex items-center gap-1">
              <Clock size={15} /> {rest.deliveryTime}
            </span>
            <span className="text-green-600 font-bold">Buka Sekarang</span>
          </div>
        </Card>
      </div>

      {/* TAMPILAN 1: DAFTAR MENU MAKANAN */}
      {step === 'menu' && (
        <div className="space-y-3">
          <h2 className="font-bold text-base text-slate-900 dark:text-white px-1">
            Menu Makanan & Minuman
          </h2>
          {rest.menuItems.map((item) => {
            const inCart = cart.items.find((i) => i.id === item.id);
            return (
              <Card
                key={item.id}
                className="p-4 flex gap-4 items-center border border-slate-200 dark:border-slate-700 hover:shadow-sm transition"
              >
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 mb-2">
                    {item.description}
                  </p>
                  <p className="font-extrabold text-sm text-primary">
                    {formatRupiah(item.price)}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {inCart ? (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-sm"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-bold text-xs px-1 text-slate-900 dark:text-white">
                        {inCart.qty}
                      </span>
                      <button
                        onClick={() => addItem({ ...item, qty: 1 })}
                        className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center shadow-sm"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="text-xs px-3.5 py-1.5 font-bold"
                      onClick={() => {
                        addItem({ ...item, qty: 1 });
                        toast.success(`${item.name} ditambahkan ke keranjang`);
                      }}
                    >
                      + Tambah
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* BAR KERANJANG TERAPUNG DI BAWAH */}
      {cart.items.length > 0 && step === 'menu' && (
        <div className="fixed bottom-16 md:bottom-4 left-4 right-4 max-w-2xl mx-auto z-40">
          <div className="bg-slate-900 dark:bg-slate-800 text-white p-3.5 px-5 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-700 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
                <ShoppingBag size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-300 font-medium">
                  {cart.items.reduce((acc, curr) => acc + curr.qty, 0)} Item Dipilih
                </p>
                <p className="font-extrabold text-base">{formatRupiah(total)}</p>
              </div>
            </div>
            <Button
              className="py-2.5 px-5 font-bold text-xs sm:text-sm shadow-md"
              onClick={() => setStep('checkout')}
            >
              Lanjut Checkout ➔
            </Button>
          </div>
        </div>
      )}

      {/* TAMPILAN 2: HALAMAN CHECKOUT LENGKAP */}
      {step === 'checkout' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-150">
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Alamat Pengantaran
            </h3>
            <div className="flex items-start gap-2.5">
              <MapPin size={18} className="text-red-500 mt-1 shrink-0" />
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                rows="2"
                placeholder="Alamat lengkap / patokan rumah..."
              ></textarea>
            </div>
          </Card>

          {/* Rincian Pesanan */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">
              Ringkasan Pesanan
            </h3>
            <div className="space-y-2 divide-y divide-slate-100 dark:divide-slate-700/50">
              {cart.items.map((i) => (
                <div key={i.id} className="pt-2 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {i.qty}x {i.name}
                    </span>
                  </div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatRupiah(i.price * i.qty)}
                  </span>
                </div>
              ))}
            </div>

            {/* Input Promo */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              <input
                type="text"
                placeholder="Kode Promo: WIRALOMBOK"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white uppercase font-bold"
              />
              <Button size="sm" variant="outline" onClick={handleApplyPromo}>
                Pakai
              </Button>
            </div>

            {/* Hitung Rincian */}
            <div className="pt-2 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal Makanan:</span>
                <span>{formatRupiah(total)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Ongkos Kirim:</span>
                <span>{formatRupiah(deliveryFee)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600 font-bold">
                  <span>Diskon Promo:</span>
                  <span>-{formatRupiah(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>Total Pembayaran:</span>
                <span className="text-primary">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </Card>

          {/* Metode Pembayaran */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Pilih Metode Bayar
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('WiraPay')}
                className={`p-3 rounded-xl border text-left transition ${
                  paymentMethod === 'WiraPay'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className="font-bold text-xs text-slate-900 dark:text-white">WiraPay</p>
                <p className="text-[10px] text-slate-500">Saldo: {formatRupiah(balance)}</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Tunai')}
                className={`p-3 rounded-xl border text-left transition ${
                  paymentMethod === 'Tunai'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <p className="font-bold text-xs text-slate-900 dark:text-white">Tunai (COD)</p>
                <p className="text-[10px] text-slate-500">Bayar ke kurir</p>
              </button>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep('menu')}
            >
              Kembali
            </Button>
            <Button
              className="flex-1 font-bold"
              onClick={handleConfirmOrder}
              disabled={loading}
            >
              {loading ? 'Memproses...' : `Pesan Sekarang • ${formatRupiah(grandTotal)}`}
            </Button>
          </div>
        </div>
      )}

      {/* TAMPILAN 3: STATUS PELACAKAN MAKANAN */}
      {step === 'tracking' && (
        <Card className="p-6 text-center space-y-4 border-2 border-primary/30 shadow-xl animate-in fade-in zoom-in duration-150">
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full mx-auto flex items-center justify-center">
            <Bike size={32} className="animate-bounce" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Pesanan Sedang Diproses
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{rest.name}</p>
          </div>

          {/* Tahapan Masak & Antar */}
          <div className="text-left space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-700 text-xs">
            <div className="flex items-start gap-3">
              <div className={`w-3 h-3 rounded-full mt-1 ${trackingStage >= 1 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Pesanan Diterima Restoran</p>
                <p className="text-slate-500">Koki sedang menyiapkan menu lezat Anda</p>
              </div>
            </div>
            <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-700 ml-1.5"></div>
            <div className="flex items-start gap-3">
              <div className={`w-3 h-3 rounded-full mt-1 ${trackingStage >= 2 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Makanan Sedang Dimasak</p>
                <p className="text-slate-500">Estimasi matang dalam 10 menit</p>
              </div>
            </div>
            <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-700 ml-1.5"></div>
            <div className="flex items-start gap-3">
              <div className={`w-3 h-3 rounded-full mt-1 ${trackingStage >= 3 ? 'bg-green-500' : 'bg-slate-300'}`}></div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Driver Mengantar ke Alamat Anda</p>
                <p className="text-slate-500">{deliveryAddress}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {trackingStage < 3 ? (
              <Button
                variant="outline"
                className="flex-1 border-primary text-primary font-bold text-xs"
                onClick={() => {
                  setTrackingStage((prev) => prev + 1);
                  toast.success('Status pesanan makanan diperbarui!');
                }}
              >
                Perbarui Status Pesanan ➔
              </Button>
            ) : (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs"
                onClick={() => {
                  setStep('menu');
                  toast.success('Makanan telah sampai! Selamat menikmati!');
                }}
              >
                Makanan Telah Diterima ✓
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
