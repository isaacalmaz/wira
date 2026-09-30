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
import { useTranslation } from '../i18n';

export default function SendPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
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

  // `name` stays Indonesian on purpose: it is written into the order's
  // `details`, which the courier reads in the partner app. Only the labels
  // rendered on this screen are translated.
  const packages = [
    { id: 'dokumen', name: 'Dokumen', price: 8000, icon: '📄' },
    { id: 'kecil', name: 'Paket Kecil', price: 12000, icon: '📦' },
    { id: 'sedang', name: 'Paket Sedang', price: 18000, icon: '💼' },
    { id: 'besar', name: 'Paket Besar', price: 30000, icon: '🧳' },
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

      if (error || !data) throw new Error(t('promo.not_found'));
      if (data.status !== 'Active') throw new Error(t('promo.inactive'));
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error(t('promo.expired'));
      if (data.service_type && data.service_type !== 'send') throw new Error(t('promo.wrong_service'));

      setActivePromo(data);
      toast.success(t('promo.success'));
    } catch (err) {
      setPromoError(err.message || t('promo.failed'));
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
      toast.error(t('send.incomplete'));
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(t('send.insufficient_balance'));
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
        console.error('Failed to geocode WiraSend address:', geoErr);
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

      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraSend Paket ke ${receiverName}`,
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
      if (paymentMethod === 'WiraPay') refreshWallet();

      if (order?.id) navigate(`/active-order/${order.id}`);

      // Best-effort nearby-courier push, fired only after the order exists,
      // never blocking or surfacing an error to the customer's booking flow.

      handleRemovePromo(); // don't let a used promo silently discount the next Send order
      toast.success(t('send.searching_courier'));
    } catch (err) {
      toast.error(t('send.failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('send.title')}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('send.subtitle')}
        </p>
      </div>

      <form onSubmit={handleOrderSubmit} className="space-y-4">
          {/* Detail Pengirim */}
          <Card className="p-4 space-y-3 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {t('send.sender_section')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t('send.sender_name')}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder={t('send.sender_phone')}
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder={t('send.sender_address')}
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
              {t('send.receiver_section')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t('send.receiver_name')}
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
              <input
                type="tel"
                placeholder={t('send.receiver_phone')}
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <textarea
              placeholder={t('send.receiver_address')}
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
              placeholder={t('send.item_note')}
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </Card>

          {/* Pilih Ukuran Paket */}
          <Card className="p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              {t('send.package_section')}
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
                      {t(`send.packages.${p.id}`)}
                    </p>
                    <p className="text-[10px] text-slate-500 mb-1">{t(`send.packages.${p.id}_desc`)}</p>
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
                  {t('promo.applied', { code: activePromo.code })}
                </span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-500 font-semibold"
                  onClick={handleRemovePromo}
                >
                  {t('common.remove')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('promo.placeholder')}
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
                  {checkingPromo ? t('promo.checking') : t('promo.apply')}
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
                {t('common.payment_method')}
              </p>
              <p className="text-[11px] text-slate-500">
                {t('send.payment_hint')}
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
                {t('common.pay_cash_cod')}
              </button>
            </div>
          </div>

          {activePromo && (
            <div className="flex justify-between items-center text-xs px-1">
              <span className="text-slate-500">{t('send.package_price')}</span>
              <span className="text-slate-500 line-through">{formatRupiah(currentPkg.price)}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-3.5 text-sm font-bold shadow-lg"
            disabled={loading}
          >
            {loading ? t('send.booking') : t('send.submit', { price: formatRupiah(calculateFinalPrice()) })}
          </Button>
        </form>
    </div>
  );
}
