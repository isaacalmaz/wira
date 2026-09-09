import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useOrders } from '../context/OrderContext';
import {
  ShoppingBag,
  Bike,
  Package,
  Home,
  Wrench,
  Waves,
  Smartphone,
  Clock,
  CheckCircle2,
  X,
  ExternalLink,
  Receipt,
} from 'lucide-react';

export default function ActivityPage() {
  const { orders } = useOrders();
  const [tab, setTab] = useState('Semua');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Helper untuk memformat details yang mungkin berisi JSON kordinat map
  const formatOrderDetails = (detailsStr) => {
    if (!detailsStr) return '';
    try {
      const parsed = JSON.parse(detailsStr);
      // Jika ini format order dari WiraRide (ada pickup dan dropoff)
      if (parsed.pickup && parsed.dropoff) {
        return `${parsed.pickup.name || 'Lokasi Jemput'} ➔ ${parsed.dropoff.name || 'Tujuan'}`;
      }
      return detailsStr; // fallback jika json lain
    } catch (e) {
      // Bukan JSON, berarti plain text
      return detailsStr;
    }
  };

  const tabs = [
    'Semua',
    'WiraRide',
    'WiraFood',
    'WiraSend',
    'WiraVilla',
    'WiraService',
    'WiraPool',
    'WiraPulsa',
  ];

  const filtered = tab === 'Semua' ? orders : orders.filter((a) => a.service === tab);

  const getServiceIcon = (service) => {
    switch (service) {
      case 'WiraRide':
        return <Bike className="text-cyan-600" size={20} />;
      case 'WiraFood':
        return <ShoppingBag className="text-orange-600" size={20} />;
      case 'WiraSend':
        return <Package className="text-blue-600" size={20} />;
      case 'WiraVilla':
        return <Home className="text-emerald-600" size={20} />;
      case 'WiraService':
        return <Wrench className="text-indigo-600" size={20} />;
      case 'WiraPool':
        return <Waves className="text-teal-600" size={20} />;
      case 'WiraPulsa':
        return <Smartphone className="text-purple-600" size={20} />;
      default:
        return <Receipt className="text-primary" size={20} />;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Aktivitas Saya
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Daftar riwayat seluruh pesanan dan transaksi Anda di Wira
        </p>
      </div>

      {/* Tabs Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition shadow-sm ${
              tab === t
                ? 'bg-primary text-white ring-2 ring-primary/30'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Daftar Kartu Pesanan */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
            <Receipt size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm font-medium">
              Belum ada aktivitas di kategori ini.
            </p>
          </div>
        ) : (
          filtered.map((act) => (
            <Card
              key={act.id}
              onClick={() => setSelectedOrder(act)}
              className="p-4 hover:border-primary/60 cursor-pointer transition hover:shadow-md border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    {getServiceIcon(act.service)}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {act.service}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                      {act.title}
                    </h3>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    act.status === 'Selesai' || act.status === 'Terkonfirmasi'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : act.status === 'Sedang Diantar' || act.status === 'Sedang Disiapkan' || act.status === 'Berjalan' || act.status === 'Dikonfirmasi' || act.status === 'Sedang Mencari'
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 animate-pulse'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  {act.status}
                </span>
              </div>

              {act.details && (
                <p className="text-xs text-slate-500 line-clamp-1 mb-2.5 pl-12">
                  {formatOrderDetails(act.details)}
                </p>
              )}

              <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100 dark:border-slate-700/60 pl-12">
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock size={11} /> {act.date}
                </span>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {formatRupiah(act.price)}
                </span>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* MODAL RINCIAN STRUK PESANAN */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setSelectedOrder(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            <div className="text-center pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-2">
                {getServiceIcon(selectedOrder.service)}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Rincian Transaksi
              </h3>
              <p className="text-xs text-slate-400 font-mono">ID: {selectedOrder.id}</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Layanan:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedOrder.service}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Judul Pesanan:</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[200px]">
                  {selectedOrder.title}
                </span>
              </div>
              {selectedOrder.details && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Rincian:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-right max-w-[200px]">
                    {formatOrderDetails(selectedOrder.details)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Waktu Transaksi:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {selectedOrder.date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Metode Bayar:</span>
                <span className="font-bold text-primary">
                  {selectedOrder.paymentMethod || 'WiraPay'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-green-600">{selectedOrder.status}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 flex justify-between items-center text-sm">
                <span className="font-bold text-slate-900 dark:text-white">
                  Total Biaya:
                </span>
                <span className="font-extrabold text-base text-primary">
                  {formatRupiah(selectedOrder.price)}
                </span>
              </div>
            </div>

            <Button
              className="w-full py-2.5 font-bold text-xs"
              onClick={() => setSelectedOrder(null)}
            >
              Tutup Rincian
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
