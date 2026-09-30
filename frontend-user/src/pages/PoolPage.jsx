import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, QrCode } from 'lucide-react';
import {
  Button,
  Card,
  Sheet,
  Field,
  Input,
  Textarea,
  Badge,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
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
          onKeyDown={(e) => {
            // Inside the booking <form>: Enter must apply the code, not place the order.
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!checking && promoCode.trim()) onApply();
            }
          }}
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

  const [titleEyebrow, titleText] = splitTitle(t('pool.title'));

  // Pool-size values are stored on the order as-is (Indonesian); only the
  // labels are translated.
  const poolSizes = [
    { value: 'Kecil (< 20 m²)', label: t('pool.size_small') },
    { value: 'Sedang (20-50 m²)', label: t('pool.size_medium') },
    { value: 'Besar (> 50 m²)', label: t('pool.size_large') },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        back="/"
        backLabel={t('common.back')}
        eyebrow={titleEyebrow}
        title={titleText}
        subtitle={t('pool.subtitle')}
        className="mb-0"
      />

      {/* Paket Langganan Bulanan */}
      <Card padding="none" className="overflow-hidden">
        <div className="tenun-band h-2.5" aria-hidden="true" />
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col items-start gap-2">
            <Badge tone="brand">{t('pool.popular_badge')}</Badge>
            <h2 className="text-balance text-[19px] font-extrabold leading-snug tracking-tight text-ink">
              {t('pool.monthly_name')}
            </h2>
            <p className="max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
              {t('pool.monthly_desc')}. {t('pool.monthly_tagline')}
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="whitespace-nowrap">
              <Money value={monthlyPackage.price} className="text-[22px] font-medium text-ink" />
              <span className="text-[13px] text-ink-muted">{t('pool.per_month')}</span>
            </p>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => handleOpenBooking(monthlyPackage)}>
              {t('pool.take_package')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Layanan Perawatan Satuan */}
      <section>
        <SectionHeader title={t('pool.single_services')} />
        <div className="flex flex-col gap-3">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-[14px] font-semibold text-ink">{t(`pool.services.${s.id}`)}</h3>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{t(`pool.services.${s.id}_desc`)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Money value={s.price} className="text-[15px] font-medium text-ink" />
                <Button variant="secondary" onClick={() => handleOpenBooking(s)}>
                  {t('pool.order_now')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* SHEET BOOKING PERAWATAN KOLAM */}
      <Sheet
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        closeLabel={t('common.close')}
        title={t('pool.booking_title', { service: serviceLabel(selectedService) })}
        description={t('pool.booking_subtitle')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="pool-booking-form" size="lg" disabled={loading} isLoading={loading}>
              {loading ? t('common.processing') : t('pool.submit')}
            </Button>
          </>
        }
      >
        <form id="pool-booking-form" onSubmit={handleConfirmOrder} className="flex flex-col gap-5">
          <Field label={t('pool.visit_date')} htmlFor="pool-date" required>
            <Input
              id="pool-date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="font-mono"
              required
            />
          </Field>

          <div className="flex flex-col gap-2">
            <GroupLabel>{t('pool.pool_size')}</GroupLabel>
            <div role="radiogroup" aria-label={t('pool.pool_size')} className="flex flex-col gap-2.5">
              {poolSizes.map((size) => (
                <ChoiceCard
                  key={size.value}
                  selected={poolSize === size.value}
                  onClick={() => setPoolSize(size.value)}
                  title={size.label}
                />
              ))}
            </div>
          </div>

          <Field label={t('pool.address_label')} htmlFor="pool-address" required>
            <Textarea
              id="pool-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('pool.address_placeholder')}
              rows={2}
              required
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
                selected={paymentMethod === 'QRIS'}
                onClick={() => setPaymentMethod('QRIS')}
                leading={<IconTile tone="neutral" size="sm"><QrCode size={18} /></IconTile>}
                title={t('common.pay_qris')}
                subtitle={t('common.pay_qris_desc')}
              />
            </div>
            {paymentMethod === 'WiraPay' && balance < calculateFinalPrice() && (
              <Notice tone="danger">{t('pool.insufficient_balance')}</Notice>
            )}
          </div>

          {/* Kode Promo */}
          <PromoField
            t={t}
            id="pool-promo"
            activePromo={activePromo}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            onApply={handleCheckPromo}
            onRemove={handleRemovePromo}
            checking={checkingPromo}
            error={promoError}
          />

          <dl className="flex flex-col rounded-card border border-line bg-card p-4 text-[13px]">
            <SummaryRow label={t('pool.total_label')} strong className="text-[14px]">
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
