import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock, Trash2, CalendarDays, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { fetchCounterpartyProfiles } from '../../services/profileService';
import useMyMerchants from '../../hooks/useMyMerchants';
import { Badge, Button, Card, EmptyState, Field, Notice, PageHeader, Select, Sheet, Spinner, Textarea, cx } from '../../components/ui';
import { friendlyError } from '../../utils/friendlyError';

// Dates are 'YYYY-MM-DD' in local (WITA) time, like orders.check_in and
// villa_blocks (migrations/0104). Ranges are [from, to): to = check-out.
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const short = (k) => fromKey(k).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const nightsOf = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
const STATUS = { pending: 'Menunggu konfirmasi', awaiting_payment: 'Menunggu pembayaran', accepted: 'Terkonfirmasi', completed: 'Selesai' };

/**
 * A host's calendar per property: guest bookings (tap to open the order)
 * and dates the host closed (own use, renovation, booked elsewhere). Tap a
 * free day, then another, to close that range; guests cannot book it.
 */
export default function VillaCalendarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { merchants, loading: loadingVillas } = useMyMerchants();
  const today = toKey(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [guests, setGuests] = useState({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); // { from, to? } nights selected to close
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeBlock, setRemoveBlock] = useState(null);

  const villaId = id || merchants[0]?.id;
  const villa = merchants.find((m) => m.id === villaId);

  const load = useCallback(async () => {
    if (!villaId) return;
    setLoading(true);
    const from = toKey(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    const [o, b] = await Promise.all([
      supabase.from('orders').select('id, user_id, status, check_in, check_out, nights, total_price, details')
        .eq('merchant_id', villaId).not('check_in', 'is', null)
        .not('status', 'in', '(cancelled,expired)')
        .lt('check_in', to).gt('check_out', from).order('check_in'),
      supabase.from('villa_blocks').select('*').eq('merchant_id', villaId).lt('date_from', to).gt('date_to', from).order('date_from'),
    ]);
    if (o.error) toast.error('Gagal memuat pesanan: ' + o.error.message);
    setBookings(o.data || []);
    setBlocks(b.data || []);
    setGuests(await fetchCounterpartyProfiles(supabase, (o.data || []).map((x) => x.user_id)));
    setLoading(false);
  }, [villaId, month]);

  useEffect(() => { load(); }, [load]);

  const nightInfo = useMemo(() => {
    const map = {};
    bookings.forEach((bk) => { for (let k = bk.check_in; k < bk.check_out; k = addDays(k, 1)) map[k] = { kind: 'booked', item: bk }; });
    blocks.forEach((bl) => { for (let k = bl.date_from; k < bl.date_to; k = addDays(k, 1)) map[k] = { kind: 'closed', item: bl }; });
    return map;
  }, [bookings, blocks]);

  const weeks = useMemo(() => {
    const lead = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toKey(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [month]);

  const tap = (k) => {
    const info = nightInfo[k];
    if (info?.kind === 'booked') { navigate(`/villa/active-order/${info.item.id}`); return; }
    if (info?.kind === 'closed') { setRemoveBlock(info.item); return; }
    if (k < today) return;
    if (!sel || sel.to || k < sel.from) { setSel({ from: k }); return; }
    for (let x = sel.from; x <= k; x = addDays(x, 1)) {
      if (nightInfo[x]) { setSel({ from: k }); return; }
    }
    setNote('');
    setSel({ from: sel.from, to: addDays(k, 1) });
  };

  const saveBlock = async () => {
    setSaving(true);
    const { error } = await supabase.from('villa_blocks').insert({ merchant_id: villaId, date_from: sel.from, date_to: sel.to, note: note.trim() || null });
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Tanggal ditutup untuk tamu');
    setSel(null);
    load();
  };

  const deleteBlock = async () => {
    const { data, error } = await supabase.from('villa_blocks').delete().eq('id', removeBlock.id).select('id');
    if (error || !data?.length) { toast.error(friendlyError(error) || 'Gagal membuka tanggal'); return; }
    toast.success('Tanggal dibuka lagi');
    setRemoveBlock(null);
    load();
  };

  if (loadingVillas) return <div className="flex justify-center py-16 text-brand-ink" role="status"><Spinner size={24} /></div>;
  if (!merchants.length) {
    return <EmptyState icon={<CalendarDays size={24} />} title="Belum ada properti" description="Tambahkan properti dulu di menu Properti." />;
  }

  const monthLabel = month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const atStart = month <= new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-24">
      <PageHeader back="/villa/listing" title="Kalender" subtitle="Pesanan tamu dan tanggal yang Anda tutup" className="mb-0" />

      {merchants.length > 1 && (
        <Select id="cal-villa" aria-label="Pilih properti" value={villaId} onChange={(e) => navigate(`/villa/calendar/${e.target.value}`, { replace: true })}>
          {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      )}
      {villa && villa.listing_status !== 'approved' && (
        <Notice tone="warning">Properti ini belum tayang, jadi belum bisa dipesan tamu. Anda tetap bisa menutup tanggal.</Notice>
      )}

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <button type="button" disabled={atStart} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Bulan sebelumnya"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sunken disabled:opacity-30"><ChevronLeft size={18} /></button>
          <p className="text-[15px] font-bold capitalize text-ink">{monthLabel}</p>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Bulan berikutnya"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sunken"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-ink-muted">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((w) => <span key={w} className="py-1">{w}</span>)}
        </div>
        <div className={cx('flex flex-col gap-0.5', loading && 'opacity-60')}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5">
              {week.map((k, di) => {
                if (!k) return <span key={di} />;
                const info = nightInfo[k];
                const selected = sel && (sel.to ? k >= sel.from && k < sel.to : k === sel.from);
                const past = k < today && !info;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={past}
                    onClick={() => tap(k)}
                    aria-label={`${short(k)}${info?.kind === 'booked' ? ', dipesan' : info?.kind === 'closed' ? ', ditutup' : ''}`}
                    className={cx(
                      'flex h-11 flex-col items-center justify-center rounded-control font-mono text-[13px] transition-colors',
                      selected ? 'bg-ink text-card'
                        : info?.kind === 'booked' ? (info.item.status === 'pending' || info.item.status === 'awaiting_payment' ? 'bg-warning-soft text-warning-ink' : 'bg-brand text-white')
                          : info?.kind === 'closed' ? 'bg-sunken text-ink-muted line-through'
                            : past ? 'text-ink-muted/40' : 'text-ink hover:bg-sunken',
                    )}
                  >
                    {fromKey(k).getDate()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11.5px] text-ink-muted">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-middle" />Terkonfirmasi</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-warning-soft align-middle ring-1 ring-warning-line" />Menunggu</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sunken align-middle ring-1 ring-line" />Ditutup</span>
        </p>
        <p className="text-[12.5px] text-ink-muted">
          {sel && !sel.to ? `Mulai ${short(sel.from)}. Ketuk tanggal terakhir yang mau ditutup.` : 'Ketuk tanggal kosong lalu tanggal lain untuk menutup rentang itu. Ketuk pesanan untuk membukanya.'}
        </p>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold text-ink">Bulan ini</h2>
        {bookings.length === 0 && blocks.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Belum ada pesanan atau tanggal yang ditutup.</p>
        ) : (
          <Card padding="none" className="divide-y divide-line">
            {bookings.map((bk) => (
              <button key={bk.id} type="button" onClick={() => navigate(`/villa/active-order/${bk.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                <User size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink">{guests[bk.user_id]?.name || 'Tamu'}</span>
                  <span className="block font-mono text-[12px] text-ink-muted">{short(bk.check_in)} → {short(bk.check_out)} · {nightsOf(bk.check_in, bk.check_out)} malam</span>
                </span>
                <Badge tone={bk.status === 'accepted' || bk.status === 'completed' ? 'success' : 'warning'}>{STATUS[bk.status] || bk.status}</Badge>
              </button>
            ))}
            {blocks.map((bl) => (
              <div key={bl.id} className="flex items-center gap-3 px-4 py-3">
                <Lock size={16} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink">Ditutup{bl.note ? `: ${bl.note}` : ''}</span>
                  <span className="block font-mono text-[12px] text-ink-muted">{short(bl.date_from)} – {short(addDays(bl.date_to, -1))}</span>
                </span>
                <Button size="sm" variant="ghost" aria-label="Buka lagi tanggal ini" onClick={() => setRemoveBlock(bl)}><Trash2 size={15} /></Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <Sheet
        open={!!sel?.to}
        onClose={() => { if (!saving) setSel(null); }}
        size="sm"
        icon={<Lock size={22} />}
        title={sel?.to ? `Tutup ${short(sel.from)} – ${short(addDays(sel.to, -1))}?` : ''}
        description={sel?.to ? `${nightsOf(sel.from, sel.to)} malam tidak bisa dipesan tamu sampai Anda membukanya lagi.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setSel(null)} disabled={saving}>Batal</Button>
            <Button onClick={saveBlock} isLoading={saving}>Tutup tanggal</Button>
          </>
        )}
      >
        <Field label="Catatan untuk Anda (opsional)" htmlFor="block-note">
          <Textarea id="block-note" rows={2} maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: dipakai keluarga, renovasi, sudah dipesan di Airbnb" />
        </Field>
      </Sheet>

      <Sheet
        open={!!removeBlock}
        onClose={() => setRemoveBlock(null)}
        size="sm"
        icon={<CalendarDays size={22} />}
        title="Buka lagi tanggal ini?"
        description={removeBlock ? `${short(removeBlock.date_from)} – ${short(addDays(removeBlock.date_to, -1))} bisa dipesan tamu lagi.` : ''}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRemoveBlock(null)}>Batal</Button>
            <Button onClick={deleteBlock}>Buka tanggal</Button>
          </>
        )}
      />
    </div>
  );
}
