import { CalendarClock, MapPin, MessageSquareText, Star, Waves, Wrench, ChevronRight, ClipboardList, Repeat } from 'lucide-react';
import { Badge, Button, Card, IconTile, Money, cx } from '../ui';
import { getDisplayStatus } from '../../constants/orderStatus';
import { formatVisitTime, visitInfo } from '../../services/technicianService';

const PAYMENT_LABEL = { cash: 'Tunai', wallet: 'WiraPay', qris: 'QRIS', transfer: 'Transfer' };

const statusTone = (status) => {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'working') return 'brand';
  return 'warning';
};

/**
 * One technician visit: an open job (with "Ambil" action) or one of the
 * technician's own jobs (opens the job page). Shows when, where, what and
 * how much, which is everything needed to decide.
 */
export default function VisitJobCard({ order, skillName, mode = 'own', onTake, onTakePackage, taking = false, packageCount = 0, onOpen }) {
  const { when, location, complaint, size } = visitInfo(order);
  const isPool = order.service_type === 'pool';
  const open = mode === 'open';
  // Open jobs carry `items` from get_open_technician_jobs; own orders keep
  // them in metadata (migrations/0090).
  const items = Array.isArray(order.items) ? order.items : (Array.isArray(order.metadata?.items) ? order.metadata.items : []);
  const packageVisit = order.metadata?.package_visit;

  const body = (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <IconTile tone="brand" size="sm">{isPool ? <Waves size={18} /> : <Wrench size={18} />}</IconTile>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {skillName && <span className="text-[12px] font-semibold text-ink-muted">{skillName}</span>}
            {open && order.is_preferred && (
              <Badge tone="pay"><Star size={11} aria-hidden="true" /> Dipilih pelanggan</Badge>
            )}
            {!open && <Badge tone={statusTone(order.status)} dot>{getDisplayStatus(order.status)}</Badge>}
            {order.package_id && (
              <Badge tone="brand"><Repeat size={11} aria-hidden="true" /> {packageVisit ? `Paket ${packageVisit}/4` : 'Paket bulanan'}</Badge>
            )}
          </div>
          <h3 className="break-words text-[15px] font-bold leading-snug text-ink">{order.title || (isPool ? 'Perawatan Kolam' : 'Servis')}</h3>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <Money value={order.total_price || 0} className="text-[16px] font-medium text-ink" />
          <span className="text-[11.5px] text-ink-muted">{PAYMENT_LABEL[order.payment_method] || order.payment_method}</span>
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 text-[13px] text-ink">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Jadwal</dt>
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <dd className="font-medium">{when ? formatVisitTime(when) : 'Jadwal belum ditentukan'}</dd>
        </div>
        {location && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Lokasi</dt>
            <MapPin size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd className="line-clamp-2 break-words text-ink-muted">{location}</dd>
          </div>
        )}
        {items.length > 0 && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Pekerjaan</dt>
            <ClipboardList size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd className="break-words text-ink">{items.map((it) => `${it.qty}× ${it.name}`).join(', ')}</dd>
          </div>
        )}
        {(complaint || size) && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Catatan</dt>
            <MessageSquareText size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd className="line-clamp-2 break-words text-ink-muted">{complaint || `Ukuran kolam: ${size}`}</dd>
          </div>
        )}
      </dl>

      {open && (order.package_id && packageCount > 1 ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" block isLoading={taking} onClick={() => onTakePackage?.(order)}>
            Ambil Semua ({packageCount} kunjungan)
          </Button>
          <p className="text-center text-[12px] text-ink-muted">Paket bulanan: kunjungan seminggu sekali untuk pelanggan yang sama.</p>
        </div>
      ) : (
        <Button variant="primary" block isLoading={taking} onClick={() => onTake?.(order)}>
          Ambil Pekerjaan
        </Button>
      ))}
    </div>
  );

  if (open) {
    return <Card padding="none" className={cx(order.is_preferred && 'border-2 border-pay-line')}>{body}</Card>;
  }
  return (
    <Card padding="none" as="button" type="button" onClick={() => onOpen?.(order)} className="w-full text-left transition-colors hover:bg-sunken/40">
      <div className="flex items-center">
        <div className="min-w-0 flex-1">{body}</div>
        <ChevronRight size={18} className="mr-3 shrink-0 text-ink-muted" aria-hidden="true" />
      </div>
    </Card>
  );
}
