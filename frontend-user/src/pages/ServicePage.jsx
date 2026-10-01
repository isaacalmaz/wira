import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snowflake, Zap, Droplets, Hammer, Wallet, Banknote, ChevronRight, BadgeCheck, Sparkles, Minus, Plus } from 'lucide-react';
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
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { fetchCoordinates } from '../utils/osmHelpers';
import { VISIT_SLOTS, openSlots, firstBookableDate, witaToday, witaDatePlus, witaInstant } from '../utils/visitSchedule';

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

export default function ServicePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { balance, refreshWallet } = useWallet();
  const { addOrder } = useOrders();

  const [technicians, setTechnicians] = useState([]);
  const [techLoaded, setTechLoaded] = useState(false);
  const [prices, setPrices] = useState({});
  // Price menu (migrations/0090): items per category, priced per unit.
  const [menu, setMenu] = useState([]);
  const [qty, setQty] = useState({}); // item code -> quantity in the open booking
  const [checkFee, setCheckFee] = useState(50000);
  const [selectedService, setSelectedService] = useState(null);
  // '' = let Wira pick (every technician with the skill is offered the job)
  const [selectedTechId, setSelectedTechId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Active technicians with at least one skill (migrations/0089); no
    // contact details are exposed.
    supabase.rpc('list_service_technicians').then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('list_service_technicians failed:', error);
      setTechnicians(Array.isArray(data) ? data : []);
      setTechLoaded(true);
    });
    // The prices admins set under Manajemen Harga; the server charges these.
    supabase.from('pricing_rules').select('*').eq('service_type', 'service').eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPrices(Object.fromEntries(data.map((r) => [r.code, Number(r.base_price)])));
        setMenu(data.filter((r) => r.item_of).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)));
        const fee = data.find((r) => r.code === 'CHECK_FEE');
        if (fee) setCheckFee(Number(fee.base_price));
      });
    return () => { cancelled = true; };
  }, []);

  // Form State
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [addressNote, setAddressNote] = useState('');
  const [serviceDate, setServiceDate] = useState(() => firstBookableDate());
  const [serviceTime, setServiceTime] = useState(() => openSlots(firstBookableDate())[0] || VISIT_SLOTS[0]);
  const timeSlots = openSlots(serviceDate);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('WiraPay');
  const [loading, setLoading] = useState(false);

  // Promo/kupon state - same shape as RidePage.jsx/RestaurantPage.jsx.
  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // `id` matches pricing_rules.code and the technician skill code; `name`
  // stays Indonesian because it is stored as the order title that the
  // technician reads in the partner app. What the customer sees comes from
  // `service.categories.*` instead. `price` is only the fallback until
  // pricing_rules loads.
  const categories = [
    { id: 'AC', icon: Snowflake, name: 'Service AC & Cuci', price: 75000 },
    { id: 'Listrik', icon: Zap, name: 'Instalasi Listrik', price: 50000 },
    { id: 'Plumbing', icon: Droplets, name: 'Pipa & Pompa Air', price: 60000 },
    { id: 'Tukang', icon: Hammer, name: 'Tukang Bangunan', price: 100000 },
  ].map((c) => ({ ...c, price: prices[c.id] ?? c.price }));
  const itemsFor = (cat) => menu.filter((m) => m.item_of === cat);
  const bookingItems = selectedService ? itemsFor(selectedService.id) : [];
  const chosenItems = bookingItems.filter((m) => (qty[m.code] || 0) > 0);
  const itemsTotal = chosenItems.reduce((sum, m) => sum + Number(m.base_price) * qty[m.code], 0);
  const changeQty = (item, delta) => setQty((q) => ({
    ...q,
    [item.code]: Math.max(0, Math.min(item.max_qty || 10, (q[item.code] || 0) + delta)),
  }));
  const techsFor = (skill) => technicians.filter((tech) => (tech.skills || []).includes(skill));
  const selectedTech = technicians.find((tech) => tech.id === selectedTechId) || null;

  const handleOpenBooking = (cat, tech = null) => {
    setSelectedService(cat);
    setSelectedTechId(tech?.id || '');
    // Start with the first item of the category picked once.
    const first = itemsFor(cat.id)[0];
    setQty(first ? { [first.code]: 1 } : {});
    const date = firstBookableDate();
    setServiceDate(date);
    setServiceTime(openSlots(date)[0] || VISIT_SLOTS[0]);
    setActivePromo(null);
    setPromoCode('');
    setPromoError('');
    setIsModalOpen(true);
  };

  const handleDateChange = (date) => {
    setServiceDate(date);
    const slots = openSlots(date);
    if (!slots.includes(serviceTime)) setServiceTime(slots[0] || '');
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
    // Itemised once the menu has loaded (0090); category price before that.
    const basePrice = bookingItems.length > 0 ? itemsTotal : (selectedService?.price || 0);
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
    if (!address.trim()) {
      toast.error(t('common.address_required'));
      return;
    }
    if (bookingItems.length > 0 && chosenItems.length === 0) {
      toast.error(t('service.pick_item'));
      return;
    }
    if (!serviceTime || !openSlots(serviceDate).includes(serviceTime)) {
      toast.error(t('service.slot_passed'));
      return;
    }

    const finalPrice = calculateFinalPrice();
    if (paymentMethod === 'WiraPay' && balance < finalPrice) {
      toast.error(t('service.insufficient_balance'));
      return;
    }

    setLoading(true);
    try {
      // The pinned point (search, GPS or dragged pin) locates the job for
      // dispatch; a typed address without a pin is geocoded best-effort.
      let point = addressCoords;
      if (!point) {
        try { point = await fetchCoordinates(address); } catch (geoErr) { console.error('Geocode failed:', geoErr); }
      }

      const order = await addOrder({
        pickupLat: point?.lat ?? null,
        pickupLng: point?.lng ?? null,
        // WiraPay is charged by create_order_and_pay in the same DB transaction
        // as the order insert, for the server-computed price (migrations/0070).
        paymentDescription: `WiraService - ${selectedService.name}`,
        service: 'WiraService',
        serviceType: 'service',
        title: selectedService.name,
        details: (selectedTech ? `Teknisi: ${selectedTech.name} • ` : '')
          + `Jadwal: ${serviceDate} pukul ${serviceTime} • Lokasi: ${withAddressNote(address, addressNote)}`
          + (notes.trim() ? ` • Keluhan: ${notes.trim()}` : ''),
        // migrations/0089: the visit time and the chosen technician, who gets
        // the job to themselves for 10 minutes before it opens to everyone
        // with the same skill.
        metadata: {
          scheduled_at: witaInstant(serviceDate, serviceTime),
          ...(chosenItems.length > 0 ? { items: chosenItems.map((m) => ({ code: m.code, qty: qty[m.code] })) } : {}),
          ...(selectedTech ? { preferred_partner_id: selectedTech.id } : {}),
        },
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

      handleRemovePromo(); // don't let a used promo silently discount the next order
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
          const count = techsFor(c.id).length;
          const unavailable = techLoaded && count === 0;
          return (
            <Card
              key={c.id}
              as="button"
              type="button"
              onClick={() => (unavailable ? toast(t('service.unavailable_toast')) : handleOpenBooking(c))}
              aria-disabled={unavailable || undefined}
              className={cx('flex flex-col items-start gap-3', unavailable && 'opacity-60')}
            >
              <IconTile tone={unavailable ? 'neutral' : 'brand'}><Icon size={20} /></IconTile>
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold leading-snug text-ink">
                  {t(`service.categories.${c.id}`)}
                </span>
                <span className="text-[12px] text-ink-muted">
                  {withMoney(t('service.starting_from', { price: SLOT }), c.price, { className: 'text-ink' })}
                </span>
                {techLoaded && (
                  <span className={cx('text-[12px] font-medium', unavailable ? 'text-ink-muted' : 'text-success-ink')}>
                    {unavailable ? t('service.unavailable') : t('service.tech_count', { count })}
                  </span>
                )}
              </span>
            </Card>
          );
        })}
      </div>

      {/* Teknisi aktif */}
      {technicians.length > 0 && (
        <section>
          <SectionHeader title={t('service.recommended')} />
          <Card padding="none" className="divide-y divide-line overflow-hidden">
            {technicians.map((tech) => {
              const firstCategory = categories.find((c) => (tech.skills || []).includes(c.id));
              const skillNames = categories.filter((c) => (tech.skills || []).includes(c.id))
                .map((c) => t(`service.categories.${c.id}`));
              return (
                <div key={tech.id} className="flex items-center gap-3 p-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft text-[15px] font-bold text-brand-ink"
                  >
                    {tech.avatar_url
                      ? <img src={tech.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      : (tech.name || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h4 className="truncate text-[14px] font-semibold text-ink">{tech.name}</h4>
                    <p className="text-[12px] text-ink-muted">
                      {skillNames.join(', ') || t('service.general_category')}
                      {tech.experience_years ? ` • ${t('service.experience_years', { count: tech.experience_years })}` : ''}
                    </p>
                    {tech.jobs_completed > 0 ? (
                      <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-success-ink">
                        <BadgeCheck size={13} aria-hidden="true" />
                        {t('service.jobs_done', { count: tech.jobs_completed })}
                      </p>
                    ) : (
                      <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-ink">
                        <Sparkles size={13} aria-hidden="true" />
                        {t('service.new_partner')}
                      </p>
                    )}
                  </div>
                  {firstCategory && (
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      rightIcon={<ChevronRight size={16} />}
                      onClick={() => handleOpenBooking(firstCategory, tech)}
                    >
                      {t('service.choose')}
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {/* SHEET BOOKING TEKNISI */}
      <Sheet
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        closeLabel={t('common.close')}
        title={t('service.booking_title', { service: t(`service.categories.${selectedService?.id}`) })}
        description={selectedTech ? t('service.technician_line', { name: selectedTech.name }) : t('service.auto_assign_line')}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="service-booking-form" size="lg" disabled={loading || !serviceTime} isLoading={loading}>
              {loading ? t('common.processing') : t('service.submit')}
            </Button>
          </>
        }
      >
        <form id="service-booking-form" onSubmit={handleConfirmOrder} className="flex flex-col gap-5">
          {selectedService && techsFor(selectedService.id).length > 0 && (
            <Field label={t('service.tech_label')} htmlFor="service-tech" hint={selectedTech ? t('service.tech_hint_chosen') : t('service.tech_hint_auto')}>
              <Select id="service-tech" value={selectedTechId} onChange={(e) => setSelectedTechId(e.target.value)}>
                <option value="">{t('service.auto_assign')}</option>
                {techsFor(selectedService.id).map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.name}</option>
                ))}
              </Select>
            </Field>
          )}

          {bookingItems.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-ink">{t('service.items_label')}</legend>
              <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-card">
                {bookingItems.map((item) => {
                  const n = qty[item.code] || 0;
                  return (
                    <li key={item.code} className="flex items-center gap-3 px-3.5 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-semibold leading-snug text-ink">{item.name}</span>
                        {item.description && <span className="text-[12px] leading-snug text-ink-muted">{item.description}</span>}
                        <span className="text-[12.5px] text-ink">
                          <Money value={Number(item.base_price)} />
                          {item.unit_label && <span className="text-ink-muted"> / {item.unit_label}</span>}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={item.name}>
                        <button
                          type="button"
                          onClick={() => changeQty(item, -1)}
                          disabled={n === 0}
                          aria-label={t('service.qty_less', { name: item.name })}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:bg-sunken disabled:opacity-40"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-6 text-center font-mono text-[15px] font-medium text-ink" aria-live="polite">{n}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(item, 1)}
                          disabled={n >= (item.max_qty || 10)}
                          aria-label={t('service.qty_more', { name: item.name })}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                {withMoney(t('service.extra_note', { fee: SLOT }), checkFee, { className: 'text-ink' })}
              </p>
            </fieldset>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('service.date_label')} htmlFor="service-date" required>
              <Input
                id="service-date"
                type="date"
                value={serviceDate}
                min={witaToday()}
                max={witaDatePlus(60)}
                onChange={(e) => handleDateChange(e.target.value)}
                className="font-mono"
                required
              />
            </Field>
            <Field label={t('service.time_label')} htmlFor="service-time">
              <Select
                id="service-time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
                disabled={timeSlots.length === 0}
              >
                {timeSlots.length === 0 && <option value="">{t('service.no_slots')}</option>}
                {timeSlots.map((time) => (
                  <option key={time} value={time}>
                    {t('service.time_option', { time })}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <AddressMapPicker
            id="service-address"
            label={t('service.address_label')}
            placeholder={t('service.address_placeholder')}
            address={address}
            onAddressChange={setAddress}
            coords={addressCoords}
            onCoordsChange={setAddressCoords}
            onNoteChange={setAddressNote}
            markerType="dropoff"
            pinLabel={t('service.address_label')}
          />
          <AddressNoteField
            id="service-address-note"
            address={address}
            lat={addressCoords?.lat}
            lng={addressCoords?.lng}
            note={addressNote}
            onNoteChange={setAddressNote}
          />

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
                  <Money value={bookingItems.length > 0 ? itemsTotal : (selectedService?.price || 0)} tone="muted" className="text-[12px] line-through" />
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
