import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, XCircle, CheckCircle2, Repeat, Coins, StickyNote, MapPin, Phone, MessageCircle, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { CORE_ADMIN_ROLES } from '../../config/roles';
import { orderStatusLabel } from '../../config/orderStatus';
import { Badge, Button, Field, Input, Money, Notice, Sheet, Spinner, Textarea, cx } from '../ui';

const SERVICE_LABEL = { ride: 'WiraRide', send: 'WiraSend', food: 'WiraFood', villa: 'WiraVilla', service: 'WiraService', pool: 'WiraPool', pulsa: 'WiraPulsa' };
const PAY_LABEL = { wallet: 'WiraPay', qris: 'QRIS', cash: 'Tunai', transfer: 'Transfer' };
const PAY_STATUS = { paid: 'Lunas', unpaid: 'Belum dibayar', refunded: 'Dikembalikan' };
const FINAL = ['completed', 'cancelled', 'expired'];
const EVENT_LABEL = {
  cancel: 'Dibatalkan admin', complete: 'Diselesaikan admin', reassign: 'Mitra diganti admin',
  compensate: 'Kompensasi', note: 'Catatan',
};

const statusTone = (s) => (s === 'completed' ? 'success' : s === 'cancelled' || s === 'expired' ? 'danger' : s === 'pending' ? 'warning' : 'brand');
const when = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}` : null;
};

const parseItems = (details) => {
  try {
    const parsed = typeof details === 'string' ? JSON.parse(details) : details;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// Which admin actions fit this order right now (mirrors admin_order_action, migrations/0100).
function actionsFor(order, core) {
  if (!order) return [];
  const list = [];
  const open = !FINAL.includes(order.status);
  const isFood = ['food', 'WiraFood'].includes(order.service_type);
  const usesPartner = ['ride', 'send', 'service', 'pool', 'food', 'WiraFood'].includes(order.service_type);
  if (core && open) list.push('cancel');
  if (core && open && (order.driver_id || order.merchant_id)) list.push('complete');
  if (core && usesPartner && order.driver_id && (isFood ? order.status === 'picking_up' : ['accepted', 'on_the_way', 'picking_up'].includes(order.status))) list.push('reassign');
  if (core && ['completed', 'cancelled'].includes(order.status)) list.push('compensate');
  list.push('note');
  return list;
}

const ACTION_META = {
  cancel: { label: 'Batalkan', icon: XCircle, variant: 'danger-soft', title: 'Batalkan pesanan', confirm: 'Batalkan pesanan' },
  complete: { label: 'Tandai selesai', icon: CheckCircle2, variant: 'secondary', title: 'Tandai pesanan selesai', confirm: 'Tandai selesai' },
  reassign: { label: 'Ganti mitra', icon: Repeat, variant: 'secondary', title: 'Lepas mitra dan cari ulang', confirm: 'Cari mitra lain' },
  compensate: { label: 'Kompensasi', icon: Coins, variant: 'secondary', title: 'Kompensasi ke pelanggan', confirm: 'Kirim kompensasi' },
  note: { label: 'Catatan', icon: StickyNote, variant: 'ghost', title: 'Catatan internal', confirm: 'Simpan catatan' },
};

/**
 * One order, in full: who, what, money, every status change and admin
 * action (order_events, migrations/0100), the chat, and the actions an
 * admin can take. Core admins can act; CS can read and add notes.
 */
export default function OrderDetailSheet({ orderId, onClose, onChanged }) {
  const { user } = useAuth();
  const core = CORE_ADMIN_ROLES.includes(user?.role);
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [chargePartner, setChargePartner] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const [o, ev, msg] = await Promise.all([
      supabase.from('orders')
        .select('*, user:users!user_id(name, phone), driver:users!driver_id(name, phone), merchant:merchants(name, owner_id)')
        .eq('id', orderId).maybeSingle(),
      supabase.from('order_events').select('*, actor:users!actor_id(name)').eq('order_id', orderId).order('created_at'),
      supabase.from('messages').select('id, sender_id, text, created_at').eq('order_id', orderId).order('created_at'),
    ]);
    if (o.error) toast.error('Gagal memuat pesanan: ' + o.error.message);
    setOrder(o.data || null);
    setEvents(ev.data || []);
    setMessages(msg.data || []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    setAction(null);
    setOrder(null);
    load();
  }, [load]);

  const start = (a) => { setAction(a); setNote(''); setAmount(''); setChargePartner(false); };

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_order_action', {
      p_order_id: orderId,
      p_action: action,
      p_note: note.trim(),
      p_amount: action === 'compensate' ? Number(amount) : null,
      p_charge_partner: action === 'compensate' ? chargePartner : false,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const refunded = Number(data?.refunded) || 0;
    toast.success({
      cancel: refunded > 0 ? `Dibatalkan, Rp ${refunded.toLocaleString('id-ID')} dikembalikan ke pelanggan` : 'Pesanan dibatalkan',
      complete: 'Pesanan ditandai selesai',
      reassign: 'Mitra dilepas, pesanan ditawarkan ulang',
      compensate: `Kompensasi Rp ${Number(amount).toLocaleString('id-ID')} terkirim`,
      note: 'Catatan disimpan',
    }[action]);
    setAction(null);
    await load();
    onChanged?.();
  };

  const partnerName = order?.driver?.name || order?.merchant?.name;
  const items = order ? parseItems(order.details) : null;
  const meta = order?.metadata || {};
  const isFood = order && ['food', 'WiraFood'].includes(order.service_type);
  const available = actionsFor(order, core);
  const am = action ? ACTION_META[action] : null;
  const paidViaWira = order && ['wallet', 'qris'].includes(order.payment_method) && order.payment_status === 'paid';
  const people = order ? [
    { role: 'Pelanggan', name: order.user?.name, phone: order.user?.phone },
    order.driver_id && { role: isFood ? 'Kurir' : ['service', 'pool'].includes(order.service_type) ? 'Teknisi' : 'Driver', name: order.driver?.name, phone: order.driver?.phone },
    order.merchant_id && { role: order.service_type === 'villa' ? 'Villa' : 'Resto', name: order.merchant?.name },
  ].filter(Boolean) : [];
  const senderLabel = (id) => (id === order?.user_id ? 'Pelanggan' : id === order?.driver_id ? 'Mitra' : id === order?.merchant?.owner_id ? 'Resto/Villa' : 'Lainnya');

  const actionHint = !order || !action ? null : {
    cancel: paidViaWira
      ? `Pelanggan menerima kembali Rp ${Number(order.total_price || 0).toLocaleString('id-ID')} ke WiraPay. Pelanggan dan mitra diberi tahu.`
      : 'Pembayaran tidak lewat Wira (tunai/belum dibayar), jadi tidak ada yang dikembalikan. Pelanggan dan mitra diberi tahu.',
    complete: 'Pendapatan mitra dicatat seperti pesanan selesai biasa. Gunakan hanya jika layanan memang sudah terjadi.',
    reassign: isFood
      ? 'Kurir dilepas dan pesanan kembali "Siap Diambil" untuk kurir lain.'
      : 'Mitra dilepas dan pesanan ditawarkan lagi ke mitra lain. Pelanggan diberi tahu.',
    compensate: `Masuk ke saldo WiraPay pelanggan. Total pengembalian untuk pesanan ini tidak boleh melebihi Rp ${Number(order.total_price || 0).toLocaleString('id-ID')}.`,
    note: 'Hanya terlihat oleh admin, tercatat di riwayat pesanan.',
  }[action];

  return (
    <Sheet
      open={!!orderId}
      onClose={() => { if (!busy) onClose(); }}
      dismissible={!busy}
      size="xl"
      icon={<ClipboardList size={22} />}
      title={order ? (order.title || SERVICE_LABEL[order.service_type] || 'Pesanan') : 'Pesanan'}
      description={order ? `${SERVICE_LABEL[order.service_type] || order.service_type} · dibuat ${when(order.created_at)}` : undefined}
      footer={action ? (
        <>
          <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Kembali</Button>
          <Button
            variant={action === 'cancel' ? 'danger' : 'primary'}
            onClick={submit}
            isLoading={busy}
            disabled={note.trim().length < 5 || (action === 'compensate' && !(Number(amount) > 0))}
          >
            {am.confirm}
          </Button>
        </>
      ) : order ? (
        <div className="flex flex-wrap justify-end gap-2">
          {available.map((a) => {
            const m = ACTION_META[a];
            const Icon = m.icon;
            return <Button key={a} variant={m.variant} leftIcon={<Icon size={16} />} onClick={() => start(a)}>{m.label}</Button>;
          })}
        </div>
      ) : null}
    >
      {loading && !order ? (
        <div className="flex justify-center py-10 text-brand" role="status"><Spinner size={22} /></div>
      ) : !order ? (
        <Notice tone="warning" title="Pesanan tidak ditemukan" />
      ) : action ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-[15px] font-bold text-ink">{am.title}</h3>
          {actionHint && <Notice tone={action === 'cancel' ? 'warning' : 'info'}>{actionHint}</Notice>}
          {action === 'compensate' && (
            <>
              <Field label="Nominal (Rp)" htmlFor="comp-amount" required>
                <Input id="comp-amount" type="number" inputMode="numeric" min="1000" step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
              </Field>
              {(order.driver_id || order.merchant_id) && (
                <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={chargePartner} onChange={(e) => setChargePartner(e.target.checked)} />
                  <span>Bebankan ke mitra ({partnerName || 'mitra'}): dipotong dari saldo pendapatannya. Jika tidak dicentang, Wira yang menanggung.</span>
                </label>
              )}
            </>
          )}
          <Field label={action === 'note' ? 'Catatan' : 'Alasan (dikirim ke pihak terkait dan dicatat)'} htmlFor="action-note" required hint="Minimal 5 karakter">
            <Textarea id="action-note" rows={3} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(order.status)} dot>{orderStatusLabel(order.status)}</Badge>
            <Badge tone="neutral">{PAY_LABEL[order.payment_method] || order.payment_method} · {PAY_STATUS[order.payment_status] || order.payment_status}</Badge>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(order.id); toast.success('ID pesanan disalin'); }}
              className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-muted hover:text-ink"
            >
              {order.id.slice(0, 8)} <Copy size={12} />
            </button>
            <span className="ml-auto text-[12px] text-ink-muted">status berubah {when(order.status_changed_at)}</span>
          </div>

          <section className="grid gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <div key={p.role} className="flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">{p.role}</p>
                  <p className="truncate text-[14px] font-semibold text-ink">{p.name || '—'}</p>
                  {p.phone && <p className="font-mono text-[12px] text-ink-muted">{p.phone}</p>}
                </div>
                {waLink(p.phone) && (
                  <a href={waLink(p.phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${p.role}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-brand-ink hover:bg-sunken">
                    <Phone size={16} />
                  </a>
                )}
              </div>
            ))}
            {!order.driver_id && !order.merchant_id && (
              <div className="rounded-control border border-dashed border-line px-3.5 py-2.5 text-[13px] text-ink-muted">Belum ada mitra</div>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-control border border-line p-3.5">
            {items ? (
              <ul className="flex flex-col gap-1">
                {items.map((it, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] text-ink">
                    <span className="w-8 shrink-0 font-mono text-ink-muted">{it.quantity || 1}×</span>
                    <span className="min-w-0 flex-1">{it.name || 'Item'}</span>
                  </li>
                ))}
              </ul>
            ) : order.details ? (
              <p className="whitespace-pre-line text-[13.5px] text-ink">{String(order.details)}</p>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              {order.scheduled_at && (<><dt className="text-ink-muted">Jadwal</dt><dd className="text-ink">{when(order.scheduled_at)} WITA</dd></>)}
              {order.check_in && (
                <><dt className="text-ink-muted">Menginap</dt><dd className="font-mono text-ink">
                  {new Date(`${order.check_in}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} → {new Date(`${order.check_out}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd></>
              )}
              {order.nights && (<><dt className="text-ink-muted">Malam</dt><dd className="font-mono text-ink">{order.nights}</dd></>)}
              {(meta.pickup_address || order.pickup_lat) && (
                <><dt className="text-ink-muted">Jemput / lokasi</dt><dd className="text-ink">
                  {meta.pickup_address || ''}{' '}
                  {order.pickup_lat && <a className="inline-flex items-center gap-1 text-brand-ink hover:underline" href={`https://maps.google.com/?q=${order.pickup_lat},${order.pickup_lng}`} target="_blank" rel="noreferrer"><MapPin size={12} />peta</a>}
                </dd></>
              )}
              {(meta.dropoff_address || order.dropoff_lat) && (
                <><dt className="text-ink-muted">Tujuan</dt><dd className="text-ink">
                  {meta.dropoff_address || ''}{' '}
                  {order.dropoff_lat && <a className="inline-flex items-center gap-1 text-brand-ink hover:underline" href={`https://maps.google.com/?q=${order.dropoff_lat},${order.dropoff_lng}`} target="_blank" rel="noreferrer"><MapPin size={12} />peta</a>}
                </dd></>
              )}
              {order.promo_code && (<><dt className="text-ink-muted">Promo</dt><dd className="font-mono text-ink">{order.promo_code}</dd></>)}
            </dl>
          </section>

          <section className="flex flex-col gap-1.5 rounded-control border border-line p-3.5 text-[13.5px]">
            <div className="flex justify-between gap-3"><span className="text-ink-muted">Total dibayar pelanggan</span><Money value={order.total_price || 0} className="font-medium text-ink" /></div>
            {Number(order.delivery_fee) > 0 && <div className="flex justify-between gap-3"><span className="text-ink-muted">Ongkir</span><Money value={order.delivery_fee} /></div>}
            {Number(order.material_amount) > 0 && <div className="flex justify-between gap-3"><span className="text-ink-muted">Bahan (tanpa komisi)</span><Money value={order.material_amount} /></div>}
            {order.commission_rate != null && (
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Komisi Wira ({(Number(order.commission_rate) * 100).toLocaleString('id-ID')}%)</span>
                <Money value={(Number(order.total_price || 0) - Number(order.material_amount || 0)) * Number(order.commission_rate)} />
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Riwayat</h3>
            {events.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Riwayat tercatat sejak pembaruan admin (Oktober 2026); pesanan lama belum punya.</p>
            ) : (
              <ol className="flex flex-col gap-0 border-l border-line pl-4">
                {events.map((e) => (
                  <li key={e.id} className="relative pb-3">
                    <span className={cx('absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full', e.kind === 'status' ? 'bg-line-strong' : e.kind === 'cancel' ? 'bg-danger' : 'bg-brand')} />
                    <p className="text-[13.5px] text-ink">
                      {e.kind === 'status'
                        ? <>{e.from_status ? `${orderStatusLabel(e.from_status)} → ` : 'Dibuat: '}<span className="font-semibold">{orderStatusLabel(e.to_status)}</span></>
                        : <span className="font-semibold">{EVENT_LABEL[e.kind] || e.kind}</span>}
                      {e.amount ? <> · <Money value={e.amount} /></> : null}
                    </p>
                    {e.note && <p className="text-[13px] text-ink-muted">{e.note}</p>}
                    <p className="font-mono text-[11.5px] text-ink-muted">{when(e.created_at)}{e.actor?.name ? ` · ${e.actor.name}` : e.kind === 'status' ? ' · sistem/mitra' : ''}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted"><MessageCircle size={14} /> Chat ({messages.length})</h3>
            {messages.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Belum ada pesan.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-control border border-line bg-sunken/50 p-3">
                {messages.map((m) => (
                  <li key={m.id} className="text-[13px]">
                    <span className="font-semibold text-ink">{senderLabel(m.sender_id)}</span>
                    <span className="ml-2 font-mono text-[11px] text-ink-muted">{when(m.created_at)}</span>
                    <p className="whitespace-pre-line break-words text-ink">{m.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
