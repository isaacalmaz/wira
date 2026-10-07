import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { orderStatusLabel } from '../../config/orderStatus';
import { Badge, Button, Card, Money, Table } from '../ui';

const SERVICE_LABEL = { ride: 'Ride', send: 'Send', food: 'Food', service: 'Service', pool: 'Pool', villa: 'Villa' };

// "45 mnt", "5 jam", "3 hari" since the order's status last changed.
const sinceLabel = (ts) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 60) return `${mins} mnt`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} jam`;
  return `${Math.round(hours / 24)} hari`;
};

/**
 * Active orders whose status has not moved for a while (admin_stale_orders,
 * migrations/0088/0089). Each row opens the order (OrderDetailSheet), where
 * the admin reads the history and chat before finishing, cancelling or
 * reassigning it. Renders nothing when nothing is stuck.
 */
export default function StaleOrdersPanel({ onOpen, refreshKey }) {
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_stale_orders', { p_minutes: 60 });
    if (error) {
      if (error.code !== 'PGRST202') console.error('Stale orders error:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (rows.length === 0) return null;

  return (
    <Card padding="none" className="overflow-hidden border-warning-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-warning-soft px-4 py-3">
        <AlertTriangle size={18} className="shrink-0 text-warning-ink" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-warning-ink">Pesanan macet</p>
          <p className="text-xs text-warning-ink/90">
            Status tidak berubah lebih dari 60 menit (kunjungan teknisi: 12 jam lewat jadwal). Buka untuk menyelesaikan, membatalkan atau mengganti mitra.
          </p>
        </div>
        <Badge tone="warning">{rows.length}</Badge>
      </div>
      <Table titleCol={3} className="rounded-none border-0">
        <thead>
          <tr>
            <th>ID</th>
            <th>Layanan</th>
            <th>Status</th>
            <th>Pelanggan</th>
            <th>Mitra</th>
            <th className="text-right">Diam</th>
            <th className="text-right">Total</th>
            <th className="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.order_id}>
              <td className="font-mono text-[12.5px]">{r.order_id.slice(0, 8)}</td>
              <td>{SERVICE_LABEL[r.service_type] || r.service_type}</td>
              <td><Badge tone="warning" dot>{orderStatusLabel(r.order_status)}</Badge></td>
              <td>{r.customer_name || '—'}</td>
              <td>{r.partner_name || '—'}</td>
              <td className="text-right font-mono">{sinceLabel(r.last_change)}</td>
              <td className="text-right"><Money value={r.total_price || 0} /></td>
              <td className="text-right">
                <Button size="sm" variant="secondary" leftIcon={<ArrowRight size={15} />} onClick={() => onOpen?.(r.order_id)}>
                  Tangani
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
