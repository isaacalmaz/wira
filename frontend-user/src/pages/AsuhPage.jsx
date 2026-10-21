import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Baby,
  Minus,
  Plus,
  Trash2,
  ShieldCheck,
  Calendar,
  ArrowRight,
  HeartHandshake,
} from 'lucide-react';
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Money,
  IconTile,
  Notice,
  PageHeader,
  SectionHeader,
  Badge,
  cx,
} from '../components/ui';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import AddressMapPicker from '../components/common/AddressMapPicker';
import AddressNoteField from '../components/common/AddressNoteField';
import { withAddressNote } from '../utils/addressNote';
import { fetchCoordinates } from '../utils/osmHelpers';
import { witaToday, witaDatePlus, witaInstant } from '../utils/visitSchedule';
import { friendlyError } from '../utils/friendlyError';

const MIN_HOURS = 2;
const MAX_HOURS = 12;
const LEAD_MS = 2 * 60 * 60 * 1000;
const TIMES = Array.from({ length: 31 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 06:00 .. 21:00
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});
const AGES = Array.from({ length: 13 }, (_, i) => i);

const openTimes = (date) =>
  TIMES.filter((time) => new Date(witaInstant(date, time)).getTime() >= Date.now() + LEAD_MS);
const firstDate = () => (openTimes(witaToday()).length ? witaToday() : witaDatePlus(1));

function SummaryRow({ label, children, strong = false, className = '' }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export default function AsuhPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ALUR 2 JENDELA: Step 1 (Waktu & Data Anak) -> Step 2 (Lokasi & Konfirmasi)
  const [step, setStep] = useState(1);

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
    supabase
      .from('pricing_rules')
      .select('code, base_price, is_active')
      .eq('service_type', 'babysit')
      .then(({ data }) => {
        const by = Object.fromEntries(
          (data || []).filter((r) => r.is_active).map((r) => [r.code, Number(r.base_price) || 0]),
        );
        setRates({ hourly: by.HOURLY ?? null, extra: by.EXTRA_CHILD ?? 0 });
      });
  }, []);

  // Pre-fill alamat dari saved_addresses jika login
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('saved_addresses')
      .select('address, lat, lng, note, phone')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (data.address) {
          setAddress((prev) => (prev ? prev : data.address));
          if (data.lat != null && data.lng != null) {
            setAddressCoords((prev) => (prev ? prev : { lat: Number(data.lat), lng: Number(data.lng) }));
          }
          if (data.note) {
            setAddressNote((prev) => (prev ? prev : data.note));
          }
        }
        if (data.phone) {
          setPhone((prev) => (prev ? prev : data.phone));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Sesi sibuk pengasuh hari itu
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
  const total =
    rates?.hourly != null ? (rates.hourly + rates.extra * (children.length - 1)) * hours : null;
  const fmt = (d) =>
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });

  const pickDate = (d) => {
    setDate(d);
    const open = openTimes(d);
    if (!open.includes(time)) setTime(open[0] || TIMES[0]);
  };

  const setChild = (i, patch) =>
    setChildren((list) => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const handleProceedToStep2 = () => {
    if (!times.includes(time)) {
      toast.error(t('asuh.err_time'));
      return;
    }
    if (under3 > 2) {
      toast.error(t('asuh.err_under3'));
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/asuh' } });
      return;
    }
    if (!times.includes(time)) {
      toast.error(t('asuh.err_time'));
      return;
    }
    if (under3 > 2) {
      toast.error(t('asuh.err_under3'));
      return;
    }
    if (!address.trim()) {
      toast.error(t('common.address_required'));
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      toast.error(t('asuh.err_phone'));
      return;
    }
    if (!agree) {
      toast.error(t('asuh.err_agree'));
      return;
    }

    setSubmitting(true);
    try {
      let point = addressCoords;
      if (!point) {
        try {
          point = await fetchCoordinates(address);
        } catch (geoErr) {
          console.error('Geocode failed:', geoErr);
        }
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
      toast.error(friendlyError(err) || t('asuh.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const dateOptions = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => witaDatePlus(i)).filter((d) => openTimes(d).length),
    [],
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-32">
      {/* HEADER NAVIGASI */}
      {step === 1 ? (
        <PageHeader
          back="/"
          backLabel={t('common.back')}
          eyebrow="WiraAsuh"
          title={t('asuh.title')}
          subtitle={t('asuh.subtitle')}
          className="mb-0"
        />
      ) : (
        <PageHeader
          back="#"
          onBack={() => setStep(1)}
          backLabel={t('asuh.change_session')}
          title={t('asuh.step_2_title')}
          subtitle={t('asuh.summary', { hours, kids: children.length })}
          className="mb-0"
        />
      )}

      {/* Kartu Informasi & Keamanan WiraAsuh */}
      {step === 1 && (
        <Card className="flex items-start gap-3 border-brand-line bg-brand-soft/30 p-4">
          <IconTile tone="brand" size="md">
            <Baby size={22} />
          </IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[14.5px] font-bold text-ink">{t('asuh.intro_title')}</h2>
              <Badge tone="success" dot>{t('common.verified') || 'Terverifikasi'}</Badge>
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-muted">{t('asuh.intro_body')}</p>
            {rates?.hourly != null && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[13px] font-bold text-ink">
                <span>
                  <Money value={rates.hourly} /> <span className="font-normal text-ink-muted">{t('asuh.per_hour')}</span>
                </span>
                {rates.extra > 0 && (
                  <span className="text-xs font-normal text-ink-muted">
                    ({t('asuh.extra_child_fee', { amount: <Money value={rates.extra} /> })})
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {rates && rates.hourly == null && <Notice tone="warning">{t('asuh.closed')}</Notice>}

      {/* ============================================================== */}
      {/* LANGKAH 1: WAKTU & DATA ANAK                                   */}
      {/* ============================================================== */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          {/* 1. Pengaturan Waktu & Durasi */}
          <Card className="flex flex-col gap-4">
            <SectionHeader title={t('asuh.when')} className="mb-0" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('asuh.date')} htmlFor="asuh-date">
                <Select id="asuh-date" value={date} onChange={(e) => pickDate(e.target.value)}>
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>
                      {new Date(`${d}T12:00:00+08:00`).toLocaleDateString('id-ID', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('asuh.start')} htmlFor="asuh-time">
                <Select id="asuh-time" value={time} onChange={(e) => setTime(e.target.value)}>
                  {times.map((x) => (
                    <option key={x} value={x}>
                      {x} WITA
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Stepper Durasi Jam */}
            <div className="flex flex-col gap-2 border-t border-line/60 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold text-ink">{t('asuh.duration')}</span>
                <span className="text-[12px] font-medium text-brand-ink">
                  {t('asuh.until', { time: `${fmt(end)} WITA` })}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-control border border-line bg-sunken/60 p-2.5">
                <button
                  type="button"
                  aria-label={t('asuh.less')}
                  disabled={hours <= MIN_HOURS}
                  onClick={() => setHours((h) => Math.max(MIN_HOURS, h - 1))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-card text-ink transition-all hover:bg-ground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Minus size={18} />
                </button>
                <div className="flex flex-col items-center justify-center">
                  <span className="font-mono text-2xl font-extrabold tracking-tight text-ink">
                    {t('asuh.hours', { n: hours })}
                  </span>
                  <span className="text-[11.5px] text-ink-muted">Min {MIN_HOURS} jam • Maks {MAX_HOURS} jam</span>
                </div>
                <button
                  type="button"
                  aria-label={t('asuh.more')}
                  disabled={hours >= MAX_HOURS}
                  onClick={() => setHours((h) => Math.min(MAX_HOURS, h + 1))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-card text-ink transition-all hover:bg-ground active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {clash && (
              <Notice tone="warning">
                {t('asuh.clash', {
                  slots: busy.map((b) => `${fmt(new Date(b.start_at))}–${fmt(new Date(b.end_at))}`).join(', '),
                })}
              </Notice>
            )}
          </Card>

          {/* 2. Data Anak yang Diasuh (Bebas dari Bug Label Hilang) */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <SectionHeader title={t('asuh.children')} className="mb-0" />
              <Badge tone="neutral">{children.length} Anak</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {children.map((c, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2.5 rounded-tile border border-line bg-sunken/40 p-3.5"
                >
                  <div className="flex items-center justify-between border-b border-line/60 pb-2">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <Baby size={15} className="text-brand-ink" aria-hidden="true" />
                      {t('asuh.child_number', { n: i + 1 })}
                    </span>
                    {children.length > 1 && (
                      <button
                        type="button"
                        aria-label={t('asuh.remove_child')}
                        onClick={() => setChildren((list) => list.filter((_, k) => k !== i))}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-danger hover:underline"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        <span>{t('common.remove') || 'Hapus'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field
                      label={t('asuh.child_name')}
                      htmlFor={`asuh-child-${i}`}
                      className="sm:col-span-2"
                    >
                      <Input
                        id={`asuh-child-${i}`}
                        value={c.name}
                        placeholder={t('asuh.child_name_ph', { n: i + 1 })}
                        onChange={(e) => setChild(i, { name: e.target.value })}
                        maxLength={50}
                      />
                    </Field>

                    <Field label={t('asuh.child_age')} htmlFor={`asuh-age-${i}`}>
                      <Select
                        id={`asuh-age-${i}`}
                        value={c.age_years}
                        onChange={(e) => setChild(i, { age_years: Number(e.target.value) })}
                      >
                        {AGES.map((a) => (
                          <option key={a} value={a}>
                            {a === 0 ? t('asuh.under1') : t('asuh.years', { n: a })}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            {children.length < 3 && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                leftIcon={<Plus size={16} />}
                onClick={() => setChildren((list) => [...list, { name: '', age_years: 3 }])}
              >
                {t('asuh.add_child')}
              </Button>
            )}

            {under3 > 2 && <Notice tone="danger">{t('asuh.err_under3')}</Notice>}
          </Card>

          {/* Jaminan Layanan */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-[12px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ShieldCheck size={15} className="text-success" /> Pengasuh Lolos Verifikasi Latar Belakang
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <HeartHandshake size={15} className="text-brand-ink" /> Pengawasan & Notifikasi Langsung Tim Wira
            </span>
          </div>

          {/* STICKY BOTTOM BAR (LANGKAH 1) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-card bg-brand px-4 py-3 text-white shadow-pop">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[12px] text-white/80">
                  {t(children.length === 1 ? 'asuh.summary_single' : 'asuh.summary', { hours, kids: children.length })}
                </p>
                {total != null && <Money value={total} className="text-[18px] font-bold text-white tracking-tight" />}
              </div>
              <Button
                variant="on-brand"
                size="md"
                disabled={rates?.hourly == null || under3 > 2}
                rightIcon={<ArrowRight size={16} />}
                onClick={handleProceedToStep2}
                className="shrink-0 px-5 font-bold shadow-sm"
              >
                {t('asuh.proceed_to_location')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LANGKAH 2: LOKASI, KONTAK & KONFIRMASI                         */}
      {/* ============================================================== */}
      {step === 2 && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* 1. Ringkasan Sesi */}
          <Card className="flex items-center justify-between border-brand-line bg-brand-soft/30 p-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-ink">
                {t('asuh.session_summary_title')}
              </span>
              <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink">
                <Calendar size={14} className="text-brand-ink" aria-hidden="true" />
                <span>
                  {new Date(`${date}T12:00:00+08:00`).toLocaleDateString('id-ID', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' • '}
                  {time} – {fmt(end)} WITA ({hours} jam)
                </span>
              </p>
              <p className="text-[12px] text-ink-muted">
                {children
                  .map((c, i) => `${c.name.trim() || `Anak ${i + 1}`} (${c.age_years === 0 ? '<1 th' : `${c.age_years} th`})`)
                  .join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="shrink-0 rounded-control border border-brand/30 bg-card px-3 py-1.5 text-xs font-bold text-brand-ink hover:bg-sunken transition-colors"
            >
              {t('asuh.change_session')}
            </button>
          </Card>

          {/* 2. Alamat Lokasi Pengasuhan (Collapsible Map Bebas Scroll Trap) */}
          <Card className="flex flex-col gap-3">
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
              collapsible={true}
              defaultExpanded={false}
            />
            <AddressNoteField
              id="asuh-address-note"
              address={address}
              lat={addressCoords?.lat}
              lng={addressCoords?.lng}
              note={addressNote}
              onNoteChange={setAddressNote}
            />
          </Card>

          {/* 3. Kontak Darurat & Catatan Pengasuh */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title="Kontak & Catatan Khusus" className="mb-0" />
            <Field label={t('asuh.phone')} htmlFor="asuh-phone" hint={t('asuh.phone_hint')} required>
              <Input
                id="asuh-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                placeholder="0812 3456 7890"
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>

            <Field label={t('asuh.notes')} htmlFor="asuh-notes" hint={t('asuh.notes_hint')}>
              <Textarea
                id="asuh-notes"
                rows={3}
                value={notes}
                placeholder={t('asuh.notes_ph')}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={400}
              />
            </Field>
          </Card>

          {/* 4. Rincian Biaya & Ketentuan */}
          <Card className="flex flex-col gap-3">
            <SectionHeader title="Rincian Biaya" className="mb-0" />
            <dl className="flex flex-col gap-2 text-[13px]">
              <SummaryRow label={`Tarif Pengasuh (${hours} jam)`}>
                {rates?.hourly != null ? <Money value={rates.hourly * hours} /> : '–'}
              </SummaryRow>
              {children.length > 1 && rates?.extra > 0 && (
                <SummaryRow label={`Anak Tambahan (${children.length - 1} anak × ${hours} jam)`}>
                  <Money value={rates.extra * (children.length - 1) * hours} />
                </SummaryRow>
              )}
              <SummaryRow label="Total Biaya" strong className="mt-1 border-t border-line/60 pt-2 text-[14px]">
                {total != null ? (
                  <Money value={total} className="text-[18px] font-medium text-ink" />
                ) : (
                  '–'
                )}
              </SummaryRow>
            </dl>

            <Notice tone="info">{t('asuh.pay_note')}</Notice>

            <label htmlFor="asuh-agree" className="flex items-start gap-2.5 pt-1 text-[13px] leading-relaxed text-ink cursor-pointer">
              <input
                id="asuh-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[rgb(var(--brand))]"
                required
              />
              <span>
                {t('asuh.agree')}{' '}
                <Link to="/terms" className="font-medium text-brand-ink underline">
                  {t('asuh.terms_link')}
                </Link>
              </span>
            </label>
          </Card>

          {/* STICKY BOTTOM CONFIRM BAR (LANGKAH 2) */}
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 md:left-64 md:px-8">
            <div className="mx-auto flex max-w-2xl items-stretch gap-2.5 rounded-card border border-line bg-card p-2.5 shadow-pop">
              <Button
                type="submit"
                size="lg"
                className="flex-1"
                isLoading={submitting}
                disabled={submitting || rates?.hourly == null || !address.trim() || !agree}
                leftIcon={<ShieldCheck size={18} />}
              >
                {submitting
                  ? t('common.processing')
                  : !address.trim()
                  ? t('common.address_required')
                  : !agree
                  ? t('asuh.err_agree')
                  : `${t('asuh.submit')} • ${total ? `Rp ${total.toLocaleString('id-ID')}` : ''}`}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
