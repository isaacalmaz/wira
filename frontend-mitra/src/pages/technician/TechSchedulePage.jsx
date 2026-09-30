import { useState, useEffect } from 'react';
import { Card, Badge, EmptyState, PageHeader, SectionHeader, cx } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Calendar, CalendarX } from 'lucide-react';
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

const TechSchedulePage = () => {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('driver_id', user.id)
        .in('service_type', TECHNICIAN_SERVICE_TYPES)
        .order('created_at', { ascending: false });

      if (data) {
        setSchedule(data.map(d => ({
          id: d.id,
          time: new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          task: d.title || 'Layanan Servis',
          address: d.details || 'Mataram',
          status: d.status
        })));
      }
    };
    fetchSchedule();
  }, [user]);

  const now = new Date();
  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader title="Jadwal Kalender" className="mb-0" />

      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-bold capitalize tracking-tight text-ink">{monthName}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Kalender Tugas</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {[...Array(31)].map((_, i) => (
            <div
              key={i}
              aria-current={i + 1 === now.getDate() ? 'date' : undefined}
              className={cx(
                'mx-auto flex h-9 w-9 items-center justify-center rounded-full font-mono text-[13px]',
                i + 1 === now.getDate() ? 'bg-brand font-semibold text-white' : 'text-ink',
              )}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </Card>

      <section>
        <SectionHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <Calendar size={17} className="text-ink-muted" aria-hidden="true" /> Agenda Tugas
              <span className="font-mono text-[13px] font-medium text-ink-muted">({now.toLocaleDateString('id-ID')})</span>
            </span>
          }
        />
        {schedule.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {schedule.map(s => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="w-12 shrink-0 pt-0.5 font-mono text-[13px] font-medium text-brand-ink">{s.time}</span>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <p className="break-words text-[14px] font-semibold leading-snug text-ink">{s.task}</p>
                    <p className="line-clamp-2 break-words text-[12.5px] leading-snug text-ink-muted">{s.address}</p>
                    <Badge tone={statusTone(s.status)} dot className="mt-1">{getDisplayStatus(s.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState icon={<CalendarX size={24} />} title="Belum ada agenda" description="Tugas servis terjadwal akan muncul di sini." />
        )}
      </section>
    </div>
  );
};
export default TechSchedulePage;
