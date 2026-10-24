import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { CalendarClock, CalendarX, Timer } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Money, PageHeader, SectionHeader, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { getDisplayStatus, statusTone } from '../../constants/orderStatus';
import { fetchMyScheduledRides, fetchOpenScheduledRides, takeScheduledRide } from '../../services/stage4Service';
import { friendlyError } from '../../utils/friendlyError';
import { parseOrderAddresses } from '../../utils/orders';

const fmtWhen = (iso) => new Date(iso).toLocaleString('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar',
});

function routeText(order) {
  const { pickup, dropoff, summary } = parseOrderAddresses(order);
  if (order.metadata?.hourly) return pickup || summary || order.title || '';
  if (pickup && dropoff) return `${pickup} → ${dropoff}`;
  return summary || pickup || dropoff || order.title || '';
}

function RideRow({ order, action }) {
  const hourly = order.metadata?.hourly;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <CalendarClock size={16} className="shrink-0 text-brand-ink" aria-hidden="true" />
            {fmtWhen(order.scheduled_at)} WITA
          </p>
          <p className="break-words text-[13px] text-ink-muted">{routeText(order)}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{order.rate_code === 'mobil' ? 'Mobil' : 'Motor'}</Badge>
            {hourly && <Badge tone="pay"><Timer size={12} aria-hidden="true" /> Sewa {hourly.hours} jam</Badge>}
            {order.status && order.status !== 'pending' && <Badge tone={statusTone(order.status)}>{getDisplayStatus(order.status, 'ride')}</Badge>}
          </div>
          {hourly?.plan && <p className="break-words text-[12.5px] text-ink-muted">Rencana: {hourly.plan}</p>}
        </div>
        <Money value={order.total_price} className="shrink-0 text-[15px] font-medium text-ink" />
      </div>
      {action}
    </Card>
  );
}

/**
 * WiraRide bookings for later (migrations/0132). Open bookings for the
 * driver's vehicle can be taken ahead of time; overlapping ones are refused
 * by the server. They become normal incoming offers 30 minutes before
 * pickup if nobody took them.
 */
export default function DriverSchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([fetchOpenScheduledRides(supabase), fetchMyScheduledRides(supabase, user.id)]);
      setOpen(o);
      setMine(m);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const take = async (order) => {
    setTaking(order.id);
    try {
      await takeScheduledRide(supabase, order.id, user.id);
      toast.success('Jadwal diambil. Pengingat dikirim 60 menit sebelum jemput.');
      load();
    } catch (err) {
      toast.error(friendlyError(err));
      load();
    } finally {
      setTaking(null);
    }
  };

  if (loading) {
    return <div className="flex h-[50vh] items-center justify-center text-brand-ink"><Spinner size={26} label="Memuat" /></div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Jadwal" subtitle="Pesanan WiraRide untuk nanti. Ambil lebih awal, berangkat paling cepat 90 menit sebelum jemput." />

      <section className="flex flex-col gap-3">
        <SectionHeader title="Jadwal saya" />
        {mine.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Belum ada jadwal yang Anda ambil.</p>
        ) : mine.map((o) => (
          <RideRow
            key={o.id}
            order={o}
            action={<Button variant="secondary" onClick={() => navigate(`/order/${o.id}`)}>Buka pesanan</Button>}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Jadwal tersedia" />
        {open.length === 0 ? (
          <EmptyState icon={<CalendarX size={22} />} title="Belum ada jadwal" description="Pesanan untuk nanti yang cocok dengan kendaraan Anda muncul di sini." />
        ) : open.map((o) => (
          <RideRow
            key={o.id}
            order={o}
            action={<Button onClick={() => take(o)} isLoading={taking === o.id} disabled={!!taking}>Ambil jadwal ini</Button>}
          />
        ))}
      </section>
    </div>
  );
}
