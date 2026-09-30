import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { Waves, Sparkles, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';

export default function PoolPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [selectedService, setSelectedService] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Same technician directory RPC ServicePage.jsx uses (SECURITY DEFINER
  // list_technicians() - migrations/0025/0026) - needed here purely to have
  // a notification target list on booking, PoolPage previously never
  // fetched technicians at all.
  const [, setTechnicians] = useState([]);
  useEffect(() => {
    const fetchTechnicians = async () => {
      const { data } = await supabase.rpc('list_technicians');
      if (data) setTechnicians(data);
    };
    fetchTechnicians();
  }, []);

  // Form State
  const [address, setAddress] = useState('');
  // Stored on the order for the technician, so the value stays Indonesian;
  // the options below show a translated label.
  const [poolSize, setPoolSize] = useState('Sedang (20-50 m²)');
  const [visitDate, setVisitDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // `id` matches pricing_rules.code; `name` stays Indonesian because it is
  // saved as the order title the pool technician reads in the partner app.
  // Customer-facing wording lives in `pool.services.*` / `pool.monthly_*`.
  const services = [
    { id: 'S1', name: 'Pembersihan Rutin', price: 200000 },
    { id: 'S2', name: 'Treatment Air & Klorinasi', price: 150000 },
    { id: 'S3', name: 'Servis Pompa & Filter Kolam', price: 300000 },
  ];

  const monthlyPackage = {
    id: 'MONTHLY',
    name: 'Paket Langganan Kolam Bulanan',
    price: 500000,
  };

  // Label shown on screen for whichever service is being booked.
  const serviceLabel = (srv) =>
    srv?.id === 'MONTHLY' ? t('pool.monthly_name') : t(`pool.services.${srv?.id}`);

  const handleOpenBooking = (srv) => {
    setSelectedService(srv);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setIsModalOpen(true);
  };

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
      if (data.service_type && data.service_type !== 'pool') throw new Error(t('promo.wrong_service'));

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
    const basePrice = selectedService?.price || 0;
    if (!activePromo) return basePrice;
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    }
    return Math.max(0, basePrice - activePromo.discount);
  };

  const handleConfirmOrder = async (e) => {
    e.preventDefault();
    if (!selectedService) return;

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(t('pool.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraPool - ${selectedService.name}`,
        service: 'WiraPool',
        serviceType: 'pool',
        title: selectedService.name,
        details: `Ukuran: ${poolSize} • Lokasi: ${address} • Kunjungan: ${visitDate}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='pool' ('S1' | 'S2' | 'S3' from `services`, or
        // 'MONTHLY' from `monthlyPackage`), per migrations/0057's seed.
        rateCode: selectedService?.id || null,
        promoCode: activePromo?.code || null,
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      setIsModalOpen(false);

      // Same reasoning as ServicePage.jsx: relevant to nearby ONLINE
      // technicians, but there's no online-status concept for technicians
      // and no get_nearest_technicians RPC in this schema - so every
      // registered technician is notified, matching
      // TechOrdersPage.jsx's own documented decision to keep pool-job
      // specialization visibility-only rather than a hard filter (avoids
      // stranding a pool job with zero eligible technicians in a small
      // market). Best-effort/fire-and-forget, never blocks the customer.

      handleRemovePromo(); // don't let a used promo silently discount the next order
      // QRIS: the order page shows the QR; technicians see it once it's paid.
      if (paymentMethod !== 'QRIS') toast.success(t('pool.success'));
    } catch (err) {
      toast.error(t('pool.failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('pool.title')}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('pool.subtitle')}
        </p>
      </div>

      {/* Banner Paket Langganan Bulanan */}
      <Card className="bg-gradient-to-r from-cyan-600 via-primary to-blue-600 text-white p-6 sm:p-8 border-0 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-15 pointer-events-none">
          <Waves size={160} />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase bg-white/20 backdrop-blur-sm px-3 py-0.5 rounded-full">
            {t('pool.popular_badge')}
          </span>
          <Sparkles size={16} className="text-amber-300" />
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">
          {t('pool.monthly_name')}
        </h2>
        <p className="text-xs sm:text-sm opacity-90 mb-6 max-w-lg leading-relaxed">
          {t('pool.monthly_desc')}. {t('pool.monthly_tagline')}
        </p>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-2 border-t border-white/20">
          <p className="text-3xl font-extrabold tracking-tight">
            {formatRupiah(monthlyPackage.price)}
            <span className="text-xs font-normal opacity-80">{t('pool.per_month')}</span>
          </p>
          <Button
            variant="secondary"
            className="font-bold py-2.5 px-6 shadow-md"
            onClick={() => handleOpenBooking(monthlyPackage)}
          >
            {t('pool.take_package')}
          </Button>
        </div>
      </Card>

      {/* Layanan Perawatan Satuan */}
      <div>
        <h3 className="font-bold text-lg mb-3 text-slate-900 dark:text-white flex items-center gap-2">
          <Waves size={20} className="text-primary" /> {t('pool.single_services')}
        </h3>
        <div className="space-y-3">
          {services.map((s) => (
            <Card
              key={s.id}
              className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 border border-slate-200 dark:border-slate-700 hover:shadow-md transition"
            >
              <div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  {t(`pool.services.${s.id}`)}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">{t(`pool.services.${s.id}_desc`)}</p>
                <p className="font-extrabold text-sm text-primary">
                  {formatRupiah(s.price)}
                </p>
              </div>
              <Button
                size="sm"
                className="font-bold text-xs shrink-0"
                onClick={() => handleOpenBooking(s)}
              >
                {t('pool.order_now')}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* MODAL BOOKING PERAWATAN KOLAM */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleConfirmOrder} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('pool.booking_title', { service: serviceLabel(selectedService) })}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('pool.booking_subtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {t('pool.visit_date')}
                    </label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {t('pool.pool_size')}
                    </label>
                    <select
                      value={poolSize}
                      onChange={(e) => setPoolSize(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none text-xs"
                    >
                      <option value="Kecil (< 20 m²)">{t('pool.size_small')}</option>
                      <option value="Sedang (20-50 m²)">{t('pool.size_medium')}</option>
                      <option value="Besar (> 50 m²)">{t('pool.size_large')}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    {t('pool.address_label')}
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('pool.address_placeholder')}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                    rows="2"
                    required
                  ></textarea>
                </div>

                {/* Metode Pembayaran */}
                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    {t('common.payment_method')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('WiraPay')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'WiraPay'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">WiraPay</p>
                      <p className="text-[10px] text-slate-500">{t('common.balance_with_amount', { amount: formatRupiah(balance) })}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('QRIS')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'QRIS'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">{t('common.pay_qris')}</p>
                      <p className="text-[10px] text-slate-500">{t('common.pay_qris_desc')}</p>
                    </button>
                  </div>
                </div>

                {/* Kode Promo */}
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl space-y-2">
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
                        className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white uppercase font-bold"
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
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">{t('pool.total_label')}</span>
                  <div className="text-right">
                    {activePromo && (
                      <p className="text-[10px] text-slate-400 line-through">{formatRupiah(selectedService?.price || 0)}</p>
                    )}
                    <span className="font-extrabold text-base text-primary">
                      {formatRupiah(calculateFinalPrice())}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 font-bold text-xs"
                    disabled={loading}
                  >
                    {loading ? t('common.processing') : t('pool.submit')}
                  </Button>
                </div>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
