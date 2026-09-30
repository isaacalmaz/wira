import { useState, useEffect, useMemo } from 'react';
import { Card, Badge, EmptyState, PageHeader, SectionHeader, cx } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Calendar, CalendarX, ChevronLeft, ChevronRight } from 'lucide-react';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';

// Order status -> Badge tone (DESIGN.md: pending = warning, active = brand,
// done = success, cancelled = danger).
const statusTone = (status) => {
  if (status === OrderStatus.COMPLETED) return 'success';
  if (status === OrderStatus.CANCELLED) return 'danger';
  if (status === OrderStatus.PENDING || status === OrderStatus.AWAITING_PAYMENT) return 'warning';
  return 'brand';
};

// Matches TechOrdersPage.jsx/TechHomePage.jsx's real filter list - previously
// this page only queried service_type 'service', silently excluding 'pool'
// (and the WiraService/WiraPool variants) from a technician's own schedule.
const TECHNICIAN_SERVICE_TYPES = ['service', 'pool', 'WiraService', 'WiraPool'];

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

// Local calendar day key, e.g. "2026-10-01".
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * When the customer booked the visit for, read from the order text the
 * customer app writes (frontend-user ServicePage / PoolPage):
 *   service: "Teknisi: … • Jadwal: 2026-10-03 pukul 09:00 • Lokasi: …"
 *   pool:    "Ukuran: … • Lokasi: … • Kunjungan: 2026-10-03"
 * Falls back to the time the order was placed.
 */
const scheduleOf = (order) => {
  const details = order.details || '';
  const service = details.match(/Jadwal: (\d{4}-\d{2}-\d{2}) pukul (\d{1,2}[:.]\d{2})/);
  const pool = details.match(/Kunjungan: (\d{4}-\d{2}-\d{2})/);
  const location = details.match(/Lokasi: (.+?)(?: • (?:Kunjungan|Keluhan):|$)/s);
  if (service) return { date: service[1], time: service[2].replace('.', ':'), location: location?.[1] };
  if (pool) return { date: pool[1], time: null, location: location?.[1] };
  const created = new Date(order.created_at);
  return {
    date: dayKey(created),
    time: created.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    location: location?.[1] || null,
  };
};

const TechSchedulePage = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today));

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('id, title, details, status, created_at')
        .eq('driver_id', user.id)
        .in('service_type', TECHNICIAN_SERVICE_TYPES)
        .order('created_at', { ascending: false });

      if (data) {
        setJobs(data.map((d) => ({
          id: d.id,
          task: d.title || 'Layanan Servis',
          status: d.status,
          ...scheduleOf(d),
        })));
      }
    };
    fetchSchedule();
  }, [user]);

  // Days of the shown month that have at least one job that isn't cancelled.
  const busyDays = useMemo(
    () => new Set(jobs.filter((j) => j.status !== OrderStatus.CANCELLED).map((j) => j.date)),
    [jobs],
  );

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ];
  }, [month]);

  const agenda = jobs
    .filter((j) => j.date === selected)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const monthName = month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayKey = dayKey(today);
  const shiftMonth = (delta) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const navBtn = 'inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink';

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Jadwal Kalender" className="mb-0" />

      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Bulan sebelumnya">
            <ChevronLeft size={18} />
          </button>
          <span className="text-[15px] font-bold capitalize tracking-tight text-ink">{monthName}</span>
          <button type="button" onClick={() => shiftMonth(1)} className={navBtn} aria-label="Bulan berikutnya">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {cells.map((d, i) => {
            if (!d) return <div key={`blank-${i}`} />;
            const key = dayKey(d);
            const isSelected = key === selected;
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}${busyDays.has(key) ? ', ada tugas' : ''}`}
                className={cx(
                  'relative mx-auto flex h-10 w-10 items-center justify-center rounded-full font-mono text-[13px] transition-colors',
                  isSelected
                    ? 'bg-brand font-semibold text-white'
                    : isToday
                      ? 'border border-brand font-semibold text-brand-ink hover:bg-brand-soft'
                      : 'text-ink hover:bg-sunken',
                )}
              >
                {d.getDate()}
                {busyDays.has(key) && (
                  <span
                    className={cx('absolute bottom-1 h-1 w-1 rounded-full', isSelected ? 'bg-white' : 'bg-pay')}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <section>
        <SectionHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <Calendar size={17} className="text-ink-muted" aria-hidden="true" /> Agenda Tugas
              <span className="text-[13px] font-medium capitalize text-ink-muted">{selectedLabel}</span>
            </span>
          }
        />
        {agenda.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {agenda.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="w-12 shrink-0 pt-0.5 font-mono text-[13px] font-medium text-brand-ink">{s.time || '—'}</span>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <p className="break-words text-[14px] font-semibold leading-snug text-ink">{s.task}</p>
                    {s.location && <p className="line-clamp-2 break-words text-[12.5px] leading-snug text-ink-muted">{s.location}</p>}
                    <Badge tone={statusTone(s.status)} dot className="mt-1">{getDisplayStatus(s.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState icon={<CalendarX size={24} />} title="Tidak ada tugas di hari ini" description="Pilih tanggal bertanda titik untuk melihat tugas terjadwal." />
        )}
      </section>
    </div>
  );
};
export default TechSchedulePage;
