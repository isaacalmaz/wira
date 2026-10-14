import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Plus, X, ShoppingBasket } from 'lucide-react';
import { Button, Card, Field, Input, Money, Notice, cx } from '../ui';
import AddressMapPicker from '../common/AddressMapPicker';
import AddressNoteField from '../common/AddressNoteField';
import { withAddressNote } from '../../utils/addressNote';
import { fetchRoute } from '../../utils/osmHelpers';
import { supabase } from '../../config/supabase';
import { useOrders } from '../../context/OrderContext';
import { useTranslation } from '../../i18n';
import { friendlyError } from '../../utils/friendlyError';

const SLOT = '\u0000';
function withMoney(text, value) {
  const [before, after = ''] = text.split(SLOT);
  return <>{before}<Money value={value} />{after}</>;
}

const MAX_ITEMS = 30;
const emptyItem = () => ({ name: '', qty: '1', note: '' });

/**
 * WiraFood "Titip beli" (migrations/0128): buy anything at any store. The
 * customer lists the items and a spending limit; the driver shops, sends the
 * receipt for approval, then delivers. Stored as a send order 'TITIP'; the
 * delivery fee comes from pricing_rules send/TITIP, the limit from
 * my_titip_budget (titip_budget_max, lower for new customers; set by admins).
 */
export default function TitipBeliForm() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addOrder } = useOrders();

  const [store, setStore] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeCoords, setStoreCoords] = useState(null);
  const [address, setAddress] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [coords, setCoords] = useState(null);
  const [items, setItems] = useState([emptyItem(), emptyItem()]);
  const [ifMissing, setIfMissing] = useState('ask');
  const [budget, setBudget] = useState('');
  const [rule, setRule] = useState(null); // { base, perKm }
  const [maxBudget, setMaxBudget] = useState(100000);
  const [limitInfo, setLimitInfo] = useState(null);
  const [routeMeters, setRouteMeters] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('pricing_rules').select('base_price, per_km_rate')
      .eq('service_type', 'send').eq('code', 'TITIP').eq('is_active', true).maybeSingle()
      .then(({ data }) => { if (data) setRule({ base: Number(data.base_price) || 0, perKm: Number(data.per_km_rate) || 0 }); });
    // New customers get a lower limit until they have a few completed orders
    // (migrations/0133, both numbers set by admins).
    supabase.rpc('my_titip_budget')
      .then(({ data }) => {
        if (data && Number(data.max) > 0) {
          setMaxBudget(Number(data.max));
          setLimitInfo(data);
        }
      });
  }, []);

  useEffect(() => {
    if (!storeCoords || !coords) { setRouteMeters(null); return undefined; }
    let cancelled = false;
    fetchRoute(storeCoords, coords).then((r) => { if (!cancelled) setRouteMeters(r?.distance ?? null); });
    return () => { cancelled = true; };
  }, [storeCoords, coords]);

  // Same formula as the server (base + km x per-km, rounded up to Rp500).
  const fee = rule
    ? (rule.perKm > 0 && routeMeters ? Math.ceil((rule.base + Math.ceil((routeMeters / 1000) * rule.perKm)) / 500) * 500 : rule.base)
    : null;
  const budgetNum = Number(String(budget).replace(/\D/g, '')) || 0;
  const filledItems = items.filter((it) => it.name.trim().length >= 2);

  const setItem = (i, patch) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const submit = async (e) => {
    e.preventDefault();
    if (store.trim().length < 3 || !storeCoords) { toast.error(t('titip.store_required')); return; }
    if (!address.trim() || !coords) { toast.error(t('titip.address_required')); return; }
    if (filledItems.length === 0) { toast.error(t('titip.items_required')); return; }
    if (budgetNum < 10000 || budgetNum > maxBudget) {
      toast.error(t('titip.budget_range', { max: maxBudget.toLocaleString('id-ID') }));
      return;
    }
    setLoading(true);
    try {
      const order = await addOrder({
        paymentDescription: `Titip beli di ${store.trim()}`,
        service: 'WiraFood',
        serviceType: 'send',
        title: `Titip beli di ${store.trim()}`,
        details: `Titip beli • ${filledItems.length} barang • Batas belanja Rp ${budgetNum.toLocaleString('id-ID')} (${storeAddress || store.trim()} ➔ ${withAddressNote(address, addressNote)})`,
        price: fee || 0,
        status: 'pending',
        paymentMethod: 'Tunai',
        packageSize: 'kecil',
        pickupLat: storeCoords.lat,
        pickupLng: storeCoords.lng,
        dropoffLat: coords.lat,
        dropoffLng: coords.lng,
        rateCode: 'TITIP',
        distanceMeters: routeMeters ?? null,
        promoCode: null,
        metadata: {
          titip: {
            store: store.trim(),
            items: filledItems.map((it) => ({ name: it.name.trim(), qty: it.qty.trim() || '1', note: it.note.trim() })),
            budget: budgetNum,
            if_missing: ifMissing,
          },
        },
      });
      if (order?.id) navigate(`/active-order/${order.id}`);
      toast.success(t('titip.placed'));
    } catch (err) {
      toast.error(t('titip.failed', { message: err.userMessage || friendlyError(err) }), { id: 'order-create-error' });
    } finally {
      setLoading(false);
    }
  };

  const chip = (active) => cx(
    'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
    active ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-card text-ink hover:border-brand',
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Notice tone="info">{t('titip.intro')}</Notice>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('titip.store_section')}</h2>
        <Field label={t('titip.store_name')} htmlFor="titip-store" required>
          <Input id="titip-store" value={store} maxLength={120} onChange={(e) => setStore(e.target.value)} placeholder={t('titip.store_placeholder')} required />
        </Field>
        <AddressMapPicker
          id="titip-store-address"
          label={t('titip.store_location')}
          placeholder={t('titip.store_location_placeholder')}
          address={storeAddress}
          onAddressChange={setStoreAddress}
          coords={storeCoords}
          onCoordsChange={setStoreCoords}
          markerType="pickup"
          pinLabel={t('titip.store_section')}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
          <ShoppingBasket size={18} className="text-brand-ink" aria-hidden="true" />
          {t('titip.items_section')}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {items.map((it, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-start gap-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Input aria-label={t('titip.item_name')} value={it.name} maxLength={80} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={t('titip.item_placeholder')} />
                <Input aria-label={t('titip.item_note')} value={it.note} maxLength={120} onChange={(e) => setItem(i, { note: e.target.value })} placeholder={t('titip.item_note')} className="min-h-9 py-1.5 text-[13px]" />
              </div>
              <Input aria-label={t('titip.item_qty')} value={it.qty} maxLength={20} onChange={(e) => setItem(i, { qty: e.target.value })} className="text-center font-mono" />
              <button
                type="button"
                onClick={() => setItems((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [emptyItem()]))}
                aria-label={t('titip.item_remove')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-sunken"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        {items.length < MAX_ITEMS && (
          <Button type="button" variant="ghost" leftIcon={<Plus size={16} />} onClick={() => setItems((list) => [...list, emptyItem()])} className="self-start">
            {t('titip.item_add')}
          </Button>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink">{t('titip.if_missing')}</span>
          <div role="radiogroup" aria-label={t('titip.if_missing')} className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={ifMissing === 'ask'} onClick={() => setIfMissing('ask')} className={chip(ifMissing === 'ask')}>{t('titip.if_missing_ask')}</button>
            <button type="button" role="radio" aria-checked={ifMissing === 'skip'} onClick={() => setIfMissing('skip')} className={chip(ifMissing === 'skip')}>{t('titip.if_missing_skip')}</button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{t('titip.address_section')}</h2>
        <AddressMapPicker
          id="titip-address"
          label={t('addresses.address_field')}
          placeholder={t('titip.address_placeholder')}
          address={address}
          onAddressChange={setAddress}
          coords={coords}
          onCoordsChange={setCoords}
          onNoteChange={setAddressNote}
          markerType="dropoff"
          pinLabel={t('titip.address_section')}
        />
        <AddressNoteField id="titip-address-note" address={address} lat={coords?.lat} lng={coords?.lng} note={addressNote} onNoteChange={setAddressNote} />
      </Card>

      <Card className="flex flex-col gap-3 border-pay-line bg-pay-soft">
        <Field
          label={t('titip.budget_label')}
          htmlFor="titip-budget"
          required
          hint={(
            <>
              {withMoney(t('titip.budget_hint', { max: SLOT }), maxBudget)}
              {limitInfo && Number(limitInfo.max) < Number(limitInfo.full_max) && (
                <> {withMoney(t('titip.budget_new_customer', {
                  max: SLOT,
                  left: Math.max(1, Number(limitInfo.trusted_orders) - Number(limitInfo.completed)),
                }), Number(limitInfo.full_max))}</>
              )}
            </>
          )}
        >
          <Input
            id="titip-budget"
            inputMode="numeric"
            value={budget ? Number(budgetNum).toLocaleString('id-ID') : ''}
            onChange={(e) => setBudget(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="250.000"
            className="font-mono"
            required
          />
        </Field>
        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">{routeMeters ? t('titip.fee_km', { km: (routeMeters / 1000).toFixed(1) }) : t('titip.fee')}</dt>
            <dd>{fee != null ? <Money value={fee} /> : '–'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-pay-line pt-1.5 font-semibold">
            <dt className="text-ink">{t('titip.pay_cash')}</dt>
            <dd>{fee != null ? withMoney(t('titip.up_to', { amount: SLOT }), (fee || 0) + budgetNum) : '–'}</dd>
          </div>
        </dl>
        <p className="text-[12px] leading-relaxed text-ink-muted">{t('titip.how')}</p>
      </Card>

      <Button type="submit" size="lg" block isLoading={loading}>{t('titip.submit')}</Button>
    </form>
  );
}
