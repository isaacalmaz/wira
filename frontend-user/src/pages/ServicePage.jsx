import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Star, X } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { formatRupiah } from '../utils/formatRupiah';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';

export default function ServicePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [technicians, setTechnicians] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchTechnicians = async () => {
      const { data: users } = await supabase.rpc('list_technicians');
      // Specialization/experience from the technician's application
      // (migrations/0084); missing before that migration -> defaults.
      const { data: profiles } = await supabase.rpc('get_technician_profiles');

      const regs = Array.isArray(profiles) ? profiles : [];
      if (users) {
        const activeTechs = users
          .map(u => {
            const reg = regs.find(r => r.id === u.id);
            return {
              id: u.id,
              name: u.name,
              category: reg?.specialization || t('service.general_category'),
              specialty: reg?.specialization
                ? t('service.specialist_in', { field: reg.specialization })
                : t('service.default_specialty'),
              rating: 5.0,
              reviews: 1,
              experience: reg?.experience
                ? t('service.experience_years', { count: reg.experience })
                : t('service.experience_min'),
              avatar: u.avatar_url || 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=200',
              phone: u.phone,
              available: true,
            };
          });
        setTechnicians(activeTechs);
      }
    };
    fetchTechnicians();
  }, []);

  // Form State
  const [address, setAddress] = useState('');
  const [serviceDate, setServiceDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [serviceTime, setServiceTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // `id` matches pricing_rules.code; `name` stays Indonesian because it is
  // stored as the order title that the technician reads in the partner app.
  // What the customer sees comes from `service.categories.*` instead.
  const categories = [
    { id: 'AC', icon: '❄️', name: 'Service AC & Cuci', price: 75000 },
    { id: 'Listrik', icon: '⚡', name: 'Instalasi Listrik', price: 50000 },
    { id: 'Plumbing', icon: '🔧', name: 'Pipa & Pompa Air', price: 60000 },
    { id: 'Tukang', icon: '🏗️', name: 'Tukang Bangunan', price: 100000 },
  ];

  const handleOpenBooking = (cat, tech = null) => {
    setSelectedService(cat);
    setSelectedTech(tech || technicians.find((tech2) => tech2.category.includes(cat.id)) || technicians[0] || { name: t('service.default_partner'), rating: 5.0 });
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
      if (data.service_type && data.service_type !== 'service') throw new Error(t('promo.wrong_service'));

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
      toast.error(t('service.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      const order = await addOrder({
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraService - ${selectedService.name}`,
        service: 'WiraService',
        serviceType: 'service',
        title: selectedService.name,
        details: `Teknisi: ${selectedTech?.name || 'Mitra Wira'} • Jadwal: ${serviceDate} pukul ${serviceTime} • Lokasi: ${address}`,
        price: finalPrice,
        paymentMethod: paymentMethod,
        // selectedService.id matches pricing_rules.code for
        // service_type='service' ('AC' | 'Listrik' | 'Plumbing' | 'Tukang'),
        // per the categories array above and migrations/0057's seed.
        rateCode: selectedService?.id || null,
        promoCode: activePromo?.code || null,
      });
      if (paymentMethod === 'WiraPay') refreshWallet();

      navigate(`/active-order/${order.id}`);
      setIsModalOpen(false);

      // Relevant to nearby ONLINE technicians, not drivers - but there is no
      // online/offline concept for technicians anywhere in this schema (no
      // equivalent of drivers.is_online), and no get_nearest_technicians RPC
      // (only list_technicians(), a flat SECURITY DEFINER directory - see
      // migrations/0025/0026). Rather than invent a new online-status column
      // for tonight, every registered technician in `technicians` is
      // notified - the same call already made for Pool jobs by
      // frontend-mitra/src/pages/technician/TechOrdersPage.jsx (see its
      // isPoolOrder comment: a hard specialization filter risks stranding a
      // job with zero eligible technicians in a small market like Lombok,
      // so filtering stays visibility-only there too). Best-effort/
      // fire-and-forget, never blocks or surfaces an error to the customer.

      handleRemovePromo(); // don't let a used promo silently discount the next order
      toast.success(t('service.success'));
    } catch (err) {
      toast.error(t('service.failed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('service.title')}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('service.subtitle')}
        </p>
      </div>

      {/* Grid Kategori Jasa */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((c) => (
          <Card
            key={c.id}
            onClick={() => handleOpenBooking(c)}
            className="p-4 cursor-pointer hover:border-primary hover:shadow-md transition-all text-center border border-slate-200 dark:border-slate-700 group"
          >
            <span className="text-4xl mb-2 block group-hover:scale-110 transition-transform">
              {c.icon}
            </span>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-primary transition-colors">
              {t(`service.categories.${c.id}`)}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{t('service.starting_from', { price: formatRupiah(c.price) })}</p>
          </Card>
        ))}
      </div>

      {/* Daftar Teknisi Rekomendasi */}
      <div>
        <h3 className="font-bold text-lg mb-3 text-slate-900 dark:text-white flex items-center gap-2">
          <Wrench size={20} className="text-primary" /> {t('service.recommended')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {technicians.length === 0 ? (
            <div className="col-span-2 p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              {t('service.empty')}
            </div>
          ) : (
            technicians.map((tech) => {
              const matchedCategory =
                categories.find((c) => tech.category.includes(c.id)) || categories[0];
              return (
                <Card
                  key={tech.id}
                  className="p-4 flex items-center justify-between gap-4 border border-slate-200 dark:border-slate-700 hover:shadow-sm"
                >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-bold flex items-center justify-center text-xl shrink-0">
                    👨‍🔧
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {tech.name}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {t('service.experience_line', { category: tech.category, years: tech.experience })}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-500 font-bold">
                      <Star size={13} fill="currentColor" /> {t('service.verified', { rating: tech.rating })}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="font-bold text-xs shrink-0"
                  onClick={() => handleOpenBooking(matchedCategory, tech)}
                >
                  {t('service.choose')}
                </Button>
              </Card>
            );
          }))}
        </div>
      </div>

      {/* MODAL BOOKING TEKNISI */}
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
                    {t('service.booking_title', { service: t(`service.categories.${selectedService?.id}`) })}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('service.technician_line', { name: selectedTech?.name })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {t('service.date_label')}
                    </label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {t('service.time_label')}
                    </label>
                    <select
                      value={serviceTime}
                      onChange={(e) => setServiceTime(e.target.value)}
                      className="w-full p-2.5 border rounded-xl dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none font-bold"
                    >
                      {['08:00', '10:00', '13:00', '15:00', '16:30'].map((time) => (
                        <option key={time} value={time}>
                          {t('service.time_option', { time })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    {t('service.address_label')}
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('service.address_placeholder')}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                    rows="2"
                    required
                  ></textarea>
                </div>

                <div>
                  <label className="font-semibold text-xs text-slate-700 dark:text-slate-300 block mb-1">
                    {t('service.complaint_label')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('service.complaint_placeholder')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
                  />
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
                      onClick={() => setPaymentMethod('Tunai')}
                      className={`p-2.5 rounded-xl border text-left text-xs transition ${
                        paymentMethod === 'Tunai'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-slate-900 dark:text-white">{t('common.pay_cash')}</p>
                      <p className="text-[10px] text-slate-500">{t('common.pay_cash_to_technician')}</p>
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
                  <span className="text-slate-500 font-medium">{t('service.estimate_label')}</span>
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
                    {loading ? t('common.processing') : t('service.submit')}
                  </Button>
                </div>
              </form>
          </div>
        </div>
      )}
    </div>
  );
}
