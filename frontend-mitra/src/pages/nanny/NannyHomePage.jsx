import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Baby, CalendarClock, Check, X, ChevronRight, Inbox } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Money, SectionHeader, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { getDisplayStatus } from '../../constants/orderStatus';
import { friendlyError } from '../../utils/friendlyError';

// WiraAsuh nanny (migrations/0107): approve or decline requests, see the
// sessions coming up.
const when = (iso, hours) => {
  const start = new Date(iso);
  const end = new Date(start.getTime() + (hours || 0) * 3600000);
  const day = start.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Makassar' });
  const t = (d) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });
  return `${day}, ${t(start)}–${t(end)} WITA`;
};
const kidsLine = (children) => (Array.isArray(children) ? children : [])
  .map((k, i) => `${k.name || `Anak ${i + 1}`} (${Number(k.age_years) === 0 ? '<1' : k.age_years} th)`).join(', ');

export default function NannyHomePage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [req, mine] = await Promise.all([
      supabase.rpc('get_babysit_requests'),
      supabase.from('orders').select('id, status, scheduled_at, metadata, total_price, details')
        .eq('service_type', 'babysit').eq('driver_id', user.id)
        .in('status', ['accepted', 'on_the_way', 'working']).order('scheduled_at'),
    ]);
    if (req.error) toast.error(req.error.message);
    setRequests(req.data || []);
    setUpcoming(mine.data || []);
  }, [user]);

  useEffect(() => {
    load();
    const ch = supabase.channel('nanny-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'service_type=eq.babysit' }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [load]);

  const respond = async (r, accept) => {
    let reason = null;
    if (!accept) {
      reason = window.prompt('Alasan menolak (dikirim ke pelanggan, boleh dikosongkan):', '');
      if (reason === null) return;
    }
    setBusyId(r.id);
    const { error } = await supabase.rpc('babysit_respond', { p_order_id: r.id, p_accept: accept, p_reason: reason });
    setBusyId(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(accept ? 'Pesanan disetujui. Pelanggan sudah dikabari.' : 'Pesanan ditolak.');
    load();
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Halo, {user?.name?.split(' ')[0] || 'Pengasuh'}</h1>
        <p className="text-sm text-ink-muted">Setujui permintaan yang sesuai jadwal Anda.</p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Permintaan Baru" className="mb-0" />
        {requests === null ? (
          <Card className="flex min-h-[100px] items-center justify-center"><Spinner /></Card>
        ) : requests.length === 0 ? (
          <EmptyState icon={<Inbox size={24} />} title="Belum ada permintaan" description="Permintaan baru muncul di sini dan dikirim sebagai notifikasi." />
        ) : requests.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-[14px] font-bold text-ink">{when(r.scheduled_at, r.hours)}</p>
                <p className="text-[13px] text-ink-muted">{r.customer_name} · {kidsLine(r.metadata?.children)}</p>
                {r.metadata?.address && <p className="break-words text-[13px] text-ink-muted">{r.metadata.address}</p>}
                {r.metadata?.notes && <p className="whitespace-pre-line break-words rounded-control bg-sunken px-3 py-2 text-[13px] text-ink">{r.metadata.notes}</p>}
              </div>
              <Money value={r.total_price} className="shrink-0 text-[15px] font-medium text-ink" />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" leftIcon={<X size={16} />} disabled={busyId === r.id} onClick={() => respond(r, false)}>Tolak</Button>
              <Button className="flex-1" leftIcon={<Check size={16} />} isLoading={busyId === r.id} onClick={() => respond(r, true)}>Setujui</Button>
            </div>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Jadwal Saya" className="mb-0" />
        {upcoming === null ? (
          <Card className="flex min-h-[100px] items-center justify-center"><Spinner /></Card>
        ) : upcoming.length === 0 ? (
          <EmptyState icon={<CalendarClock size={24} />} title="Belum ada sesi terjadwal" description="Sesi yang Anda setujui tampil di sini." />
        ) : upcoming.map((o) => (
          <Link key={o.id} to={`/nanny/active-order/${o.id}`} className="block">
            <Card className="flex items-center gap-3 transition-colors hover:bg-sunken">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink"><Baby size={18} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[14px] font-semibold text-ink">{when(o.scheduled_at, o.metadata?.hours)}</p>
                <p className="truncate text-[12.5px] text-ink-muted">{kidsLine(o.metadata?.children)}</p>
                <Badge tone={o.status === 'working' ? 'success' : 'brand'} dot className="self-start">{getDisplayStatus(o.status, o.service_type || 'babysit')}</Badge>
              </div>
              <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
