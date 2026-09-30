import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Card, Badge, Button, Money, IconTile, Stat, SectionHeader, EmptyState, cx } from '../../components/ui';
import { Calendar, Wrench, Waves, BellRing, MapPin, Wallet, ChevronRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { parseOrderDetails } from '../../utils/formatters';
import { OrderStatus, getDisplayStatus } from '../../constants/orderStatus';
import { acceptOrder, subscribeToTechnicianOrders, technicianEarnedAmount } from '../../services/orderService';

// See TechOrdersPage.jsx's identical helper/comment - visibility-only
// distinction between pool and general service jobs, not a hard filter.
const isPoolOrder = (order) => order?.service_type === 'pool' || order?.service_type === 'WiraPool';

// ---- Presentational helpers (Tenun Laut) ----

/** Rupiah that can be negative (Tunai orders net the commission out of the
 * saldo), rounded the same way formatSignedRupiah does. */
const SignedMoney = ({ value, className = '' }) => {
  const n = Math.round(Number(value) || 0);
  return <Money value={n} sign={n < 0 ? 'minus' : undefined} className={className} />;
};

/** The online/offline switch: a 44px touch target around a 48x28 track. */
const OnlineSwitch = ({ isOnline, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={isOnline}
    onClick={() => onChange(!isOnline)}
    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
  >
    <span className="sr-only">Toggle Online Status</span>
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-flex h-7 w-12 items-center rounded-full border transition-colors duration-150',
        isOnline ? 'border-success bg-success' : 'border-line-strong bg-sunken',
      )}
    >
      <span
        className={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.3)] transition-transform duration-150',
          isOnline ? 'translate-x-[23px]' : 'translate-x-[3px]',
        )}
      />
    </span>
  </button>
);

const TechHomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(true);
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);

  useEffect(() => {
    const fetchTechData = async () => {
      if (!user) return;

      // Must only ever return orders that are either (a) already assigned to
      // THIS technician, or (b) unassigned pool/service jobs available to
      // claim - previously the .or() conditions were alternatives, not an
      // AND, so `service_type.eq.service,service_type.eq.pool` matched ANY
      // order of that type platform-wide, regardless of whose driver_id it
      // had. That leaked another technician's in-progress job (customer
      // name/phone/price, and a clickable route into their active-order
      // page) into this technician's "Jadwal Pekerjaan" list. Service-type
      // list matches TechOrdersPage.jsx's fetchOrders filter.
      const { data } = await supabase
        .from('orders')
        .select('*')
        .or(`driver_id.eq.${user.id},and(driver_id.is.null,service_type.in.(service,pool,WiraService,WiraPool))`)
        .order('created_at', { ascending: false });

      if (data) {
        const completed = data.filter(d => d.status === 'completed' && d.driver_id === user.id);
        const todayStr = new Date().toLocaleDateString('id-ID');
        let tEarn = 0;
        let wEarn = 0;

        completed.forEach(c => {
          // Real technician share (net of Tunai commission), not raw total_price.
          const price = technicianEarnedAmount(c);
          if (new Date(c.created_at).toLocaleDateString('id-ID') === todayStr) {
            tEarn += price;
          }
          wEarn += price;
        });

        setTodayEarnings(tEarn);
        setWeekEarnings(wEarn);

        // Pekerjaan hari ini - jobs already in progress must be explicitly
        // re-filtered to this technician's own driver_id. The query above
        // also returns unassigned pool/service jobs available to claim
        // (driver_id null), which must never surface here as if they were
        // this technician's own active work.
        const activeJobs = data.filter(d => d.driver_id === user.id && [OrderStatus.ACCEPTED, OrderStatus.ON_THE_WAY, OrderStatus.WORKING].includes(d.status));
        setTodayOrders(activeJobs);
      }
    };
    fetchTechData();

    // Listen incoming orders
    if (!isOnline || !user) {
      setIncomingOrder(null);
      return;
    }

    const unsubscribe = subscribeToTechnicianOrders(supabase, (order) => {
      setIncomingOrder(order);
      toast.success('Panggilan Jasa Baru Masuk!');
    });

    return unsubscribe;
  }, [isOnline, user]);

  const handleAcceptJob = async () => {
    if (!incomingOrder || !user) return;
    try {
      await acceptOrder(supabase, incomingOrder.id, user.id, 'technician');
      toast.success('Panggilan jasa diterima!');
      setIncomingOrder(null);
    } catch (err) {
      toast.error('Panggilan sudah diambil teknisi lain.');
      setIncomingOrder(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="break-words text-[22px] font-extrabold leading-tight tracking-tight text-ink text-balance sm:text-2xl">Halo, {user?.name || 'Mitra Teknisi'}!</h1>
        <p className="text-sm text-ink-muted">Mitra Jasa Servis Wira</p>
      </div>

      {/* Online/offline: the most important state on this screen */}
      <Card padding="none" className="flex items-center gap-3 py-2 pl-4 pr-2">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Terima Panggilan</span>
          <Badge tone={isOnline ? 'success' : 'neutral'} dot>{isOnline ? 'Online' : 'Offline'}</Badge>
        </div>
        <OnlineSwitch isOnline={isOnline} onChange={setIsOnline} />
      </Card>

      <Stat
        label="Pendapatan Hari Ini"
        value={<SignedMoney value={todayEarnings} />}
        icon={<Wallet size={18} />}
        tone="pay"
        hint={<>Minggu ini: <SignedMoney value={weekEarnings} className="font-medium text-ink" /></>}
      />

      {isOnline && incomingOrder && (
        <section>
          <SectionHeader title={<span className="inline-flex items-center gap-2"><BellRing size={18} className="text-brand-ink" aria-hidden="true" /> Panggilan Baru</span>} />
          <Card padding="none" className="border-2 border-brand">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-start gap-3">
                <IconTile tone="brand" size="sm">
                  {isPoolOrder(incomingOrder) ? <Waves size={18} /> : <Wrench size={18} />}
                </IconTile>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[12px] font-semibold text-ink-muted">{incomingOrder.title || (isPoolOrder(incomingOrder) ? 'Servis Kolam Renang' : 'Servis Panggilan')}</span>
                  <h3 className="break-words text-[15px] font-bold leading-snug text-ink">{parseOrderDetails(incomingOrder.details) || 'Permintaan perbaikan'}</h3>
                </div>
                <Money value={incomingOrder.total_price || 0} className="shrink-0 text-[18px] font-medium text-ink" />
              </div>
              <p className="flex items-center gap-1.5 text-[13px] text-ink-muted"><MapPin size={15} className="shrink-0" aria-hidden="true" /> Mataram dan sekitarnya</p>
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <Button variant="secondary" size="lg" className="sm:min-w-32" onClick={() => setIncomingOrder(null)}>Tolak</Button>
                <Button variant="primary" size="lg" className="sm:min-w-44" onClick={handleAcceptJob}>Terima Panggilan</Button>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title={<span className="inline-flex items-center gap-2"><Calendar size={18} className="text-ink-muted" aria-hidden="true" /> Jadwal Pekerjaan</span>} />
        {todayOrders.length > 0 ? (
          <Card padding="none">
            <ul className="divide-y divide-line">
              {todayOrders.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => navigate('active-order/' + s.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken/60"
                  >
                    <span className="w-12 shrink-0 pt-0.5 font-mono text-[13px] font-medium text-brand-ink">
                      {new Date(s.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="flex items-start gap-1.5 text-[14px] font-semibold leading-snug text-ink">
                        {isPoolOrder(s) ? <Waves size={14} className="mt-[3px] shrink-0 text-brand-ink" /> : <Wrench size={14} className="mt-[3px] shrink-0 text-ink-muted" />}
                        <span className="min-w-0 break-words">{s.title || (isPoolOrder(s) ? 'Servis Kolam Renang' : 'Servis')}</span>
                      </span>
                      <span className="line-clamp-2 break-words text-[12.5px] leading-snug text-ink-muted">{parseOrderDetails(s.details) || '-'}</span>
                      <Badge tone={s.status === 'working' ? 'brand' : 'warning'} dot className="mt-1">{getDisplayStatus(s.status)}</Badge>
                    </span>
                    <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState icon={<Calendar size={24} />} title="Belum ada jadwal pekerjaan aktif saat ini." />
        )}
      </section>
    </div>
  );
};
export default TechHomePage;
