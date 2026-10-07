import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Baby, Minus, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, Input, Textarea, Select, Money, IconTile, Notice, PageHeader, SectionHeader, cx } from '../components/ui';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { fetchCoordinates } from '../utils/osmHelpers';
import { witaToday, witaDatePlus, witaInstant } from '../utils/visitSchedule';

// WiraAsuh (migrations/0107): one in-house nanny; a request waits for the
// nanny's approval, the price is computed by create_babysit_booking.
const MIN_HOURS = 2;
const MAX_HOURS = 12;
const LEAD_MS = 2 * 60 * 60 * 1000;
const TIMES = Array.from({ length: 31 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 06:00 .. 21:00
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});
const AGES = Array.from({ length: 13 }, (_, i) => i);

const openTimes = (date) => TIMES.filter((time) => new Date(witaInstant(date, time)).getTime() >= Date.now() + LEAD_MS);
const firstDate = () => (openTimes(witaToday()).length ? witaToday() : witaDatePlus(1));

export default function AsuhPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rates, setRates] = useState(null);
  const [date, setDate] = useState(firstDate);
  const [time, setTime] = useState(() => openTimes(firstDate())[0] || TIMES[0]);
  const [hours, setHours] = useState(4);
  const [children, setChildren] = useState([{ name: '', age_years: 3 }]);
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [addressNote, setAddressNote] = useState('');
  const [phone, setPhone] = useState(user?.user_metadata?.phone || '');
  const [notes, setNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('pricing_rules').select('code, base_price, is_active').eq('service_type', 'babysit')
      .then(({ data }) => {
        const by = Object.fromEntries((data || []).filter((r) => r.is_active).map((r) => [r.code, Number(r.base_price) || 0]));
        setRates({ hourly: by.HOURLY ?? null, extra: by.EXTRA_CHILD ?? 0 });
      });
  }, []);

  // Approved sessions that day, so a clash shows before sending.
  useEffect(() => {
    const from = witaInstant(date, '00:00');
    const to = new Date(new Date(from).getTime() + 86400000).toISOString();
    supabase.rpc('get_babysit_busy', { p_from: from, p_to: to }).then(({ data }) => setBusy(data || []));
  }, [date]);

  const times = openTimes(date);
  const start = new Date(witaInstant(date, time));
  const end = new Date(start.getTime() + hours * 3600000);
  const clash = busy.some((b) => new Date(b.start_at) < end && new Date(b.end_at) > start);
  const under3 = children.filter((c) => Number(c.age_years) < 3).length;
  const total = rates?.hourly != null ? (rates.hourly + rates.extra * (children.length - 1)) * hours : null;
  const fmt = (d) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });

  const pickDate = (d) => {
    setDate(d);
    const open = openTimes(d);
    if (!open.includes(time)) setTime(open[0] || TIMES[0]);
  };
  const setChild = (i, patch) => setChildren((list) => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const submit = async () => {
    if (!user) { navigate('/login', { state: { from: '/asuh' } }); return; }
    if (!times.includes(time)) { toast.error(t('asuh.err_time')); return; }
    if (under3 > 2) { toast.error(t('asuh.err_under3')); return; }
    if (!address.trim()) { toast.error(t('common.address_required')); return; }
    if (phone.replace(/\D/g, '').length < 8) { toast.error(t('asuh.err_phone')); return; }
    if (!agree) { toast.error(t('asuh.err_agree')); return; }

    setSubmitting(true);
    try {
      let point = addressCoords;
      if (!point) {
        try { point = await fetchCoordinates(address); } catch (geoErr) { console.error('Geocode failed:', geoErr); }
      }
      const { data, error } = await supabase.rpc('create_babysit_booking', {
        p_start: start.toISOString(),
        p_hours: hours,
        p_children: children.map((c) => ({ name: c.name.trim() || null, age_years: Number(c.age_years) })),
        p_address: withAddressNote(address, addressNote),
        p_lat: point?.lat ?? null,
        p_lng: point?.lng ?? null,
        p_notes: notes.trim() || null,
        p_emergency_phone: phone.trim(),
      });
      if (error) throw error;
      toast.success(t('asuh.sent'));
      navigate(`/active-order/${data}`);
    } catch (err) {
      toast.error(err.message || t('asuh.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  // Today plus 7 days: bookings open one week ahead (migrations/0113).
  const dateOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => witaDatePlus(i)).filter((d) => openTimes(d).length), []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-16">
      <PageHeader back="/" backLabel={t('common.back')} eyebrow="Wira" title="Asuh" subtitle={t('asuh.subtitle')} className="mb-0" />

      <Card className="flex items-start gap-3">
        <IconTile tone="brand"><Baby size={20} /></IconTile>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[14px] font-bold text-ink">{t('asuh.intro_title')}</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">{t('asuh.intro_body')}</p>
          {rates?.hourly != null && (
            <p className="text-[13px] font-semibold text-ink"><Money value={rates.hourly} /> {t('asuh.per_hour')}</p>
          )}
        </div>
      </Card>

      {rates && rates.hourly == null && <Notice tone="warning">{t('asuh.closed')}</Notice>}

      <section className="flex flex-col gap-4">
        <SectionHeader title={t('asuh.when')} className="mb-0" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('asuh.date')} htmlFor="asuh-date">
            <Select id="asuh-date" value={date} onChange={(e) => pickDate(e.target.value)}>
              {dateOptions.map((d) => (
                <option key={d} value={d}>{new Date(`${d}T12:00:00+08:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('asuh.start')} htmlFor="asuh-time">
            <Select id="asuh-time" value={time} onChange={(e) => setTime(e.target.value)}>
              {times.map((x) => <option key={x} value={x}>{x} WITA</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('asuh.duration')} htmlFor="asuh-hours" hint={t('asuh.until', { time: fmt(end) })}>
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="w-11 px-0" aria-label={t('asuh.less')} disabled={hours <= MIN_HOURS} onClick={() => setHours((h) => Math.max(MIN_HOURS, h - 1))}><Minus size={18} /></Button>
            <span id="asuh-hours" className="min-w-[72px] text-center font-mono text-[16px] font-medium text-ink">{t('asuh.hours', { n: hours })}</span>
            <Button variant="secondary" className="w-11 px-0" aria-label={t('asuh.more')} disabled={hours >= MAX_HOURS} onClick={() => setHours((h) => Math.min(MAX_HOURS, h + 1))}><Plus size={18} /></Button>
          </div>
        </Field>
        {clash && (
          <Notice tone="warning">
            {t('asuh.clash', { slots: busy.map((b) => `${fmt(new Date(b.start_at))}–${fmt(new Date(b.end_at))}`).join(', ') })}
          </Notice>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t('asuh.children')} className="mb-0" />
        {children.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={i === 0 ? t('asuh.child_name') : undefined} htmlFor={`asuh-child-${i}`} className="min-w-0 flex-1">
              <Input id={`asuh-child-${i}`} value={c.name} placeholder={t('asuh.child_name_ph', { n: i + 1 })} onChange={(e) => setChild(i, { name: e.target.value })} />
            </Field>
            <Field label={i === 0 ? t('asuh.child_age') : undefined} htmlFor={`asuh-age-${i}`} className="w-28">
              <Select id={`asuh-age-${i}`} value={c.age_years} onChange={(e) => setChild(i, { age_years: Number(e.target.value) })}>
                {AGES.map((a) => <option key={a} value={a}>{a === 0 ? t('asuh.under1') : t('asuh.years', { n: a })}</option>)}
              </Select>
            </Field>
            {children.length > 1 && (
              <Button variant="ghost" className="w-11 px-0" aria-label={t('asuh.remove_child')} onClick={() => setChildren((list) => list.filter((_, k) => k !== i))}><Trash2 size={18} /></Button>
            )}
          </div>
        ))}
        {children.length < 3 && (
          <Button variant="secondary" size="sm" className="self-start" leftIcon={<Plus size={16} />} onClick={() => setChildren((list) => [...list, { name: '', age_years: 3 }])}>
            {t('asuh.add_child')}
          </Button>
        )}
        {under3 > 2 && <Notice tone="danger">{t('asuh.err_under3')}</Notice>}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader title={t('asuh.where')} className="mb-0" />
        <AddressMapPicker
          id="asuh-address"
          label={t('asuh.address')}
          placeholder={t('asuh.address_ph')}
          address={address}
          onAddressChange={setAddress}
          coords={addressCoords}
          onCoordsChange={setAddressCoords}
          onNoteChange={setAddressNote}
          markerType="dropoff"
          pinLabel={t('asuh.address')}
        />
        <AddressNoteField id="asuh-address-note" address={address} lat={addressCoords?.lat} lng={addressCoords?.lng} note={addressNote} onNoteChange={setAddressNote} />
        <Field label={t('asuh.phone')} htmlFor="asuh-phone" hint={t('asuh.phone_hint')}>
          <Input id="asuh-phone" type="tel" inputMode="tel" value={phone} placeholder="0812 3456 7890" onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('asuh.notes')} htmlFor="asuh-notes" hint={t('asuh.notes_hint')}>
          <Textarea id="asuh-notes" rows={4} value={notes} placeholder={t('asuh.notes_ph')} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] text-ink-muted">{t('asuh.summary', { hours, kids: children.length })}</span>
          {total != null && <Money value={total} className="text-[20px] font-medium text-ink" />}
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('asuh.pay_note')}</p>
        <label htmlFor="asuh-agree" className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink">
          <input id="asuh-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]" />
          <span>{t('asuh.agree')} <Link to="/terms" className="font-medium text-brand-ink underline">{t('asuh.terms_link')}</Link></span>
        </label>
        <Button block size="lg" isLoading={submitting} disabled={submitting || rates?.hourly == null} leftIcon={<ShieldCheck size={18} />} onClick={submit}
          className={cx(clash && 'opacity-90')}>
          {t('asuh.submit')}
        </Button>
      </Card>
    </div>
  );
}
