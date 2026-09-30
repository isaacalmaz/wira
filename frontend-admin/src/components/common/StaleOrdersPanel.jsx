import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { orderStatusLabel } from '../../config/orderStatus';
import { Badge, Button, Card, Field, Money, Sheet, Table, Textarea } from '../ui';

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
 * migrations/0088), with the two ways out: finish it (partner gets paid) or
 * cancel it (customer refunded when they paid through Wira). Renders nothing
 * when there is nothing stuck or before 0088 is applied.
 */
export default function StaleOrdersPanel({ onResolved }) {
  const [rows, setRows] = useState([]);
  const [target, setTarget] = useState(null); // { row, action: 'complete' | 'cancel' }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_stale_orders', { p_minutes: 60 });
    if (error) {
      if (error.code !== 'PGRST202') console.error('Stale orders error:', error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_resolve_order', {
        p_order_id: target.row.order_id,
        p_action: target.action,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const refunded = Number(data?.refunded) || 0;
      toast.success(target.action === 'complete'
        ? 'Pesanan ditandai selesai.'
        : refunded > 0
          ? `Pesanan dibatalkan, Rp ${refunded.toLocaleString('id-ID')} dikembalikan ke pelanggan.`
          : 'Pesanan dibatalkan.');
      setTarget(null);
      setNote('');
      await load();
      onResolved?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menyelesaikan pesanan.');
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) return null;

  const isCancel = target?.action === 'cancel';
  const paidThroughWira = target && ['wallet', 'qris'].includes(target.row.payment_method) && target.row.payment_status === 'paid';

  return (
    <Card padding="none" className="overflow-hidden border-warning-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-warning-soft px-4 py-3">
        <AlertTriangle size={18} className="shrink-0 text-warning-ink" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-warning-ink">Pesanan macet</p>
          <p className="text-xs text-warning-ink/90">
            Status tidak berubah lebih dari 60 menit (Service dan Pool: 48 jam). Selesaikan atau batalkan agar pelanggan dan mitra tidak menunggu.
          </p>
        </div>
        <Badge tone="warning">{rows.length}</Badge>
      </div>
      <Table className="rounded-none border-0">
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
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<CheckCircle2 size={15} />} onClick={() => setTarget({ row: r, action: 'complete' })}>
                    Selesaikan
                  </Button>
                  <Button size="sm" variant="danger-soft" leftIcon={<XCircle size={15} />} onClick={() => setTarget({ row: r, action: 'cancel' })}>
                    Batalkan
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Sheet
        open={!!target}
        onClose={() => { if (!busy) { setTarget(null); setNote(''); } }}
        dismissible={!busy}
        tone={isCancel ? 'danger' : 'default'}
        icon={isCancel ? <XCircle size={22} /> : <CheckCircle2 size={22} />}
        title={isCancel ? 'Batalkan pesanan ini?' : 'Tandai pesanan selesai?'}
        description={!target ? '' : isCancel
          ? (paidThroughWira
            ? 'Pesanan dibatalkan dan pembayarannya dikembalikan ke saldo WiraPay pelanggan. Pelanggan menerima notifikasi.'
            : 'Pesanan dibatalkan. Pembayaran tunai tidak lewat Wira, jadi tidak ada yang dikembalikan. Pelanggan menerima notifikasi.')
          : 'Pesanan dianggap selesai dan pendapatan mitra dicatat seperti pesanan selesai biasa. Gunakan hanya jika layanan memang sudah terjadi.'}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setTarget(null); setNote(''); }} disabled={busy}>Kembali</Button>
            <Button variant={isCancel ? 'danger' : 'primary'} onClick={resolve} isLoading={busy}>
              {isCancel ? 'Batalkan pesanan' : 'Tandai selesai'}
            </Button>
          </>
        )}
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-card px-3.5 py-3 text-[13px]">
              <span className="min-w-0 truncate text-ink">{target.row.title || SERVICE_LABEL[target.row.service_type]}</span>
              <Money value={target.row.total_price || 0} className="font-medium text-ink" />
            </div>
            {isCancel && (
              <Field label="Catatan untuk pelanggan (opsional)" htmlFor="stale-note">
                <Textarea id="stale-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} />
              </Field>
            )}
          </div>
        )}
      </Sheet>
    </Card>
  );
}
