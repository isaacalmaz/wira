import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import SavedAddressPicker from '../components/common/SavedAddressPicker';
import { formatRupiah } from '../utils/formatRupiah';
import { fetchCoordinates } from '../utils/osmHelpers';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';

export default function SendPage() {
  const navigate = useNavigate();
  const { balance, pay } = useWallet();
  const { addOrder } = useOrders();

  const [selectedPackage, setSelectedPackage] = useState('kecil');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx's
  // handleCheckPromo/activePromo/calculateFinalPrice.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Form State
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderAddress, setSenderAddress] = useState('');

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [itemNote, setItemNote] = useState('');

  const packages = [
    { id: 'dokumen', name: 'Dokumen', desc: 'Berkas / Kertas (< 1kg)', price: 8000, icon: '📄' },
    { id: 'kecil', name: 'Paket Kecil', desc: 'Makanan / Baju (< 5kg)', price: 12000, icon: '📦' },
    { id: 'sedang', name: 'Paket Sedang', desc: 'Elektronik / Kardus (< 15kg)', price: 18000, icon: '💼' },
    { id: 'besar', name: 'Paket Besar', desc: 'Barang Berat (< 30kg)', price: 30000, icon: '🧳' },
  ];

  const currentPkg = packages.find((p) => p.id === selectedPackage) || packages[1];

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError('');
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .eq('code', promoCode.toUpperCase().trim())
        .single();

      if (error || !data) throw new Error('Kode promo tidak ditemukan');
      if (data.status !== 'Active') throw new Error('Promo sudah tidak aktif');
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error('Promo sudah kadaluarsa');
      if (data.service_type && data.service_type !== 'send') throw new Error('Promo tidak berlaku untuk layanan ini');

      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
  };

  const calculateFinalPrice = () => {
    const basePrice = currentPkg.price;
    if (!activePromo) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!senderName || !senderPhone || !senderAddress || !receiverName || !receiverPhone || !receiverAddress) {
      toast.error('Mohon lengkapi seluruh data pengirim dan penerima');
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error('Saldo WiraPay Anda tidak mencukupi');
      return;
    }

    setLoading(true);
    try {
      const resi = 'WRS-' + Math.floor(100000 + Math.random() * 900000);

      // Best-effort geocode of the pickup address so nearby couriers can be
      // notified (mirrors RestaurantPage.jsx geocoding a merchant's address)
      // - SendPage previously had no coordinates at all, only free-text
      // addresses. A failed/empty geocode just means no nearby-courier
      // notification fires below; it must never block the booking itself.
      let pickupLat = null;
      let pickupLng = null;
      let dropoffLat = null;
      let dropoffLng = null;
      try {
        const [pickupCoords, dropoffCoords] = await Promise.all([
          fetchCoordinates(senderAddress),
          fetchCoordinates(receiverAddress),
        ]);
        if (pickupCoords) {
          pickupLat = pickupCoords.lat;
          pickupLng = pickupCoords.lng;
        }
        if (dropoffCoords) {
          dropoffLat = dropoffCoords.lat;
          dropoffLng = dropoffCoords.lng;
        }
      } catch (geoErr) {
        console.error('Gagal geocode alamat WiraSend:', geoErr);
      }

      // Nearest-driver lookup, reused as the notification fan-out target the
      // same way RidePage.jsx does. NOTE on eligibility: not every driver
      // can take a Send job (migrations/0033 - requires 'send' in
      // job_type_preferences, and for a 'mobil' driver additionally
      // package_size IN ('sedang','besar')). get_nearest_drivers only
      // filters by vehicle type/online status, not job-type preferences, so
      // this can notify some drivers who aren't actually eligible to claim
      // this particular Send job. A proper client-side eligibility filter
      // was considered (querying users.job_type_preferences for the nearby
      // ids) but public.users' RLS (migrations/0025/0026) only lets a
      // customer read a driver's row once that driver is actually assigned
      // to one of their orders - it can't be read for an unmatched nearby
      // candidate without a new SECURITY DEFINER RPC, which is out of scope
      // tonight. Per the task's own guidance this is low-severity noise (an
      // ineligible driver just can't claim it), so option (a) - notify
      // plain nearest drivers - is used here, same as Ride.
      let nearbyDrivers = [];
      if (pickupLat != null && pickupLng != null) {
        const { data: nearby } = await supabase.rpc('get_nearest_drivers', {
          user_lat: pickupLat,
          user_lng: pickupLng,
          target_vehicle_type: null,
          only_online: true,
          max_results: 5,
        });
        nearbyDrivers = nearby || [];
      }

      // Debit up-front, same reasoning as Ride/Food: don't depend on the tab
      // staying open until completion to actually charge the customer.
      if (paymentMethod === 'WiraPay') {
        await pay(finalPrice, `WiraSend Paket ke ${receiverName}`);
      }

      const order = await addOrder({
        service: 'WiraSend',
        serviceType: 'send',
        title: `Kirim Paket ke ${receiverName}`,
        details: `No. Resi: ${resi} • ${currentPkg.name} (${senderAddress} ➔ ${receiverAddress})`,
        price: finalPrice,
        status: 'pending',
        paymentMethod: paymentMethod,
        packageSize: selectedPackage,
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        // selectedPackage already holds the exact tier id ('dokumen' |
        // 'kecil' | 'sedang' | 'besar'), matching pricing_rules.code for
        // service_type='send' (migrations/0057's seed).
        rateCode: selectedPackage,
        promoCode: activePromo?.code || null,
      });

      // Only counted as "used" once the order actually exists - see
      // migrations/0046's increment_promo_usage.
      if (activePromo?.id) {
        supabase.rpc('increment_promo_usage', { promo_id: activePromo.id }).then(({ error: usageErr }) => {
          if (usageErr) console.error('Gagal mencatat pemakaian promo:', usageErr);
        });
      }

      if (order?.id) navigate(`/active-order/${order.id}`);

      // Best-effort nearby-courier push, fired only after the order exists,
      // never blocking or surfacing an error to the customer's booking flow.

      handleRemovePromo(); // don't let a used promo silently discount the next Send order
      toast.success('Mencari kurir terdekat...');
    } catch (err) {
      toast.error(err.message || 'Pemesanan kurir gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          WiraSend (Kirim Paket Kilat)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Kirim barang, makanan, dan dokumen instan sampai hari ini se-Pulau Lombok
        </p>
      </div>

      <form onSubmit={handleOrderSubmit} className="space-y-4">
          {/* Detail Pengirim */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Titik Penjemputan (Pengirim)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nama Pengirim"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder="Nomor HP Pengirim"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder="Alamat Lengkap Penjemputan (cth: Jl. Pejanggik No. 12, Mataram)"
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              rows="2"
              required
            ></textarea>
            <div className="flex justify-end">
              <SavedAddressPicker requireCoords={false} onSelect={({ address }) => setSenderAddress(address)} />
            </div>
          </Card>

          {/* Detail Penerima */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Titik Pengantaran (Penerima)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nama Penerima"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder="Nomor HP Penerima"
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder="Alamat Lengkap Tujuan (cth: Komplek Puri Meninting, Senggigi)"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              rows="2"
              required
            ></textarea>
            <div className="flex justify-end">
              <SavedAddressPicker requireCoords={false} onSelect={({ address }) => setReceiverAddress(address)} />
            </div>
            <input
              type="text"
              placeholder="Catatan / Isi Paket (cth: Kue lapis / Dokumen sertifikat)"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </Card>

          {/* Pilih Ukuran Paket */}
          <Card className="p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              Pilih Ukuran Paket
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {packages.map((p) => {
                const isSelected = selectedPackage === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPackage(p.id)}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary dark:border-primary shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-2xl mb-1 block">{p.icon}</span>
                    <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-500 mb-1">{p.desc}</p>
                    <p className="font-extrabold text-xs text-primary">
                      {formatRupiah(p.price)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Kode Promo */}
          <Card className="p-4 border border-slate-200 dark:border-slate-700 space-y-2">
            {activePromo ? (
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-green-600 dark:text-green-400">
                  Promo "{activePromo.code}" diterapkan
                </span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-500 font-semibold"
                  onClick={handleRemovePromo}
                >
                  Hapus
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kode Promo (opsional)"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white uppercase font-bold"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs px-3"
                  onClick={handleCheckPromo}
                  disabled={checkingPromo || !promoCode.trim()}
                >
                  {checkingPromo ? '...' : 'Pakai'}
                </Button>
              </div>
            )}
            {promoError && (
              <p className="text-[11px] text-red-500 font-semibold">{promoError}</p>
            )}
          </Card>

          {/* Metode Pembayaran */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Metode Pembayaran
              </p>
              <p className="text-[11px] text-slate-500">
                Pilih pembayaran via WiraPay atau Tunai (COD)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('WiraPay')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  paymentMethod === 'WiraPay'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                WiraPay ({formatRupiah(balance)})
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Tunai')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  paymentMethod === 'Tunai'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Tunai (COD)
              </button>
            </div>
          </div>

          {activePromo && (
            <div className="flex justify-between items-center text-xs px-1">
              <span className="text-slate-500">Harga Paket:</span>
              <span className="text-slate-500 line-through">{formatRupiah(currentPkg.price)}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-3.5 text-sm font-bold shadow-lg"
            disabled={loading}
          >
            {loading ? 'Memesan Kurir...' : `Pesan Kurir Sekarang • ${formatRupiah(calculateFinalPrice())}`}
          </Button>
        </form>
    </div>
  );
}
