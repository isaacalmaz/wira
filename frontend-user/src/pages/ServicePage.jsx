import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Star, Snowflake, Zap, Droplets, Hammer, Wallet, Banknote, ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  Sheet,
  Field,
  Input,
  Textarea,
  Select,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  EmptyState,
  cx,
} from '../components/ui';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { useTranslation } from '../i18n';

// ---- Tenun Laut booking helpers (presentational only) ----

// Placeholder used to drop a <Money> into a translated sentence, so an
// amount inside e.g. "Saldo: {{amount}}" still renders in mono.
const SLOT = '\u0000';
function withMoney(text, value, moneyProps = {}) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} {...moneyProps} />{after}</>;
}

// "WiraX — Descriptive title" -> eyebrow + title.
function splitTitle(text) {
  const i = text.indexOf(' — ');
  return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [null, text];
}

// Selectable option: 2px brand border + radio when selected.
function ChoiceCard({ selected, onClick, leading, title, subtitle, trailing }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex w-full min-h-11 items-center gap-3 rounded-tile bg-card text-left transition-colors',
        selected ? 'border-2 border-brand px-[13px] py-[11px]' : 'border border-line px-3.5 py-3 hover:border-line-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-brand' : 'border-line-strong')}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink">{title}</span>
        {subtitle && <span className="text-[12px] text-ink-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </button>
  );
}

function GroupLabel({ children }) {
  return <p className="text-[13px] font-semibold text-ink">{children}</p>;
}

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function PromoField({ t, id, activePromo, promoCode, setPromoCode, onApply, onRemove, checking, error }) {
  if (activePromo) {
    return (
      <Notice
        tone="success"
        action={
          <Button variant="ghost" size="sm" onClick={onRemove} className="-my-1.5">
            {t('common.remove')}
          </Button>
        }
      >
        {t('promo.applied', { code: activePromo.code })}
      </Notice>
    );
  }
  return (
    <Field label={t('promo.placeholder')} htmlFor={id} error={error || undefined}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          invalid={!!error}
          autoCapitalize="characters"
          className="min-w-0 flex-1 font-mono uppercase"
        />
        <Button
          variant="secondary"
          onClick={onApply}
          disabled={checking || !promoCode.trim()}
          className="shrink-0"
        >
          {checking ? t('promo.checking') : t('promo.apply')}
        </Button>
      </div>
    </Field>
  );
}

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
    { id: 'AC', icon: Snowflake, name: 'Service AC & Cuci', price: 75000 },
    { id: 'Listrik', icon: Zap, name: 'Instalasi Listrik', price: 50000 },
    { id: 'Plumbing', icon: Droplets, name: 'Pipa & Pompa Air', price: 60000 },
    { id: 'Tukang', icon: Hammer, name: 'Tukang Bangunan', price: 100000 },
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

  const [titleEyebrow, titleText] = splitTitle(t('service.title'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        eyebrow={titleEyebrow}
        title={titleText}
        subtitle={t('service.subtitle')}
        className="mb-0"
      />

      {/* Grid Kategori Jasa */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((c) => {
          const Icon = c.icon;
          return (
            <Card
              key={c.id}
              as="button"
              type="button"
              onClick={() => handleOpenBooking(c)}
              className="flex flex-col items-start gap-3"
            >
              <IconTile tone="brand"><Icon size={20} /></IconTile>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold leading-snug text-ink">
                  {t(`service.categories.${c.id}`)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {withMoney(t('service.starting_from', { price: SLOT }), c.price, { className: 'text-ink' })}
                </span>
              </span>
            </Card>
          );
        })}
      </div>

      {/* Daftar Teknisi Rekomendasi */}
      <section>
        <SectionHeader title={t('service.recommended')} />
        {technicians.length === 0 ? (
          <EmptyState icon={<Wrench size={22} />} title={t('service.empty')} />
        ) : (
          <Card padding="none" className="divide-y divide-line overflow-hidden">
            {technicians.map((tech) => {
              const matchedCategory =
                categories.find((c) => tech.category.includes(c.id)) || categories[0];
              return (
                <div key={tech.id} className="flex items-center gap-3 p-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-[15px] font-bold text-brand-ink"
                  >
                    {(tech.name || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h4 className="truncate text-[14px] font-semibold text-ink">{tech.name}</h4>
                    <p className="text-[12px] text-ink-muted">
                      {t('service.experience_line', { category: tech.category, years: tech.experience })}
                    </p>
                    <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink">
                      <Star size={12} className="fill-current" aria-hidden="true" />
                      {t('service.verified', { rating: tech.rating })}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    rightIcon={<ChevronRight size={16} />}
                    onClick={() => handleOpenBooking(matchedCategory, tech)}
                  >
                    {t('service.choose')}
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* SHEET BOOKING TEKNISI */}
      <Sheet
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        closeLabel={t('common.close')}
        title={t('service.booking_title', { service: t(`service.categories.${selectedService?.id}`) })}
        description={t('service.technician_line', { name: selectedTech?.name })}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="service-booking-form" size="lg" disabled={loading} isLoading={loading}>
              {loading ? t('common.processing') : t('service.submit')}
            </Button>
          </>
        }
      >
        <form id="service-booking-form" onSubmit={handleConfirmOrder} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('service.date_label')} htmlFor="service-date" required>
              <Input
                id="service-date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="font-mono"
                required
              />
            </Field>
            <Field label={t('service.time_label')} htmlFor="service-time">
              <Select
                id="service-time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
              >
                {['08:00', '10:00', '13:00', '15:00', '16:30'].map((time) => (
                  <option key={time} value={time}>
                    {t('service.time_option', { time })}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t('service.address_label')} htmlFor="service-address" required>
            <Textarea
              id="service-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('service.address_placeholder')}
              rows={2}
              required
            />
          </Field>

          <Field label={t('service.complaint_label')} htmlFor="service-notes">
            <Input
              id="service-notes"
              type="text"
              placeholder={t('service.complaint_placeholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {/* Metode Pembayaran */}
          <div className="flex flex-col gap-2">
            <GroupLabel>{t('common.payment_method')}</GroupLabel>
            <div role="radiogroup" aria-label={t('common.payment_method')} className="flex flex-col gap-2.5">
              <ChoiceCard
                selected={paymentMethod === 'WiraPay'}
                onClick={() => setPaymentMethod('WiraPay')}
                leading={<IconTile tone="pay" size="sm"><Wallet size={18} /></IconTile>}
                title="WiraPay"
                subtitle={withMoney(t('common.balance_with_amount', { amount: SLOT }), balance)}
              />
              <ChoiceCard
                selected={paymentMethod === 'Tunai'}
                onClick={() => setPaymentMethod('Tunai')}
                leading={<IconTile tone="neutral" size="sm"><Banknote size={18} /></IconTile>}
                title={t('common.pay_cash')}
                subtitle={t('common.pay_cash_to_technician')}
              />
            </div>
            {paymentMethod === 'WiraPay' && balance < calculateFinalPrice() && (
              <Notice tone="danger">{t('service.insufficient_balance')}</Notice>
            )}
          </div>

          {/* Kode Promo */}
          <PromoField
            t={t}
            id="service-promo"
            activePromo={activePromo}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            onApply={handleCheckPromo}
            onRemove={handleRemovePromo}
            checking={checkingPromo}
            error={promoError}
          />

          <dl className="flex flex-col rounded-card border border-line bg-card p-4 text-[13px]">
            <SummaryRow label={t('service.estimate_label')} strong className="text-[14px]">
              <span className="flex flex-col items-end">
                {activePromo && (
                  <Money value={selectedService?.price || 0} tone="muted" className="text-[12px] line-through" />
                )}
                <Money value={calculateFinalPrice()} className="text-[17px] font-medium" />
              </span>
            </SummaryRow>
          </dl>
        </form>
      </Sheet>
    </div>
  );
}
