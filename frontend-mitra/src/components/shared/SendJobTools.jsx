import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Camera, CheckCircle2, Circle, Lock, ReceiptText, ShoppingBasket, Truck, X } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, Field, Input, Money, Notice, Textarea, cx } from '../ui';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { uploadPrivateImage } from '../../utils/imageUpload';
import { friendlyError } from '../../utils/friendlyError';
import { finishTitipWithPin, startTitipDelivery, submitBigItemQuote, submitTitipReceipt } from '../../services/sendJobService';

const MAX_RECEIPT_PHOTOS = 3;

function ReceiptPhotos({ files, onChange }) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="relative">
          <img src={previews[i]} alt="" className="h-20 w-20 rounded-control border border-line object-cover" />
          <button
            type="button"
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            aria-label={`Hapus foto ${i + 1}`}
            className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-ink shadow-sm"
          >
            <X size={14} />
          </button>
        </span>
      ))}
      {files.length < MAX_RECEIPT_PHOTOS && (
        <label className="inline-flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-[11px] text-ink-muted hover:bg-sunken">
          <Camera size={20} aria-hidden="true" />
          Foto struk
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange([...files, file].slice(0, MAX_RECEIPT_PHOTOS));
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}

/**
 * Driver side of the free-form send jobs (migrations/0128).
 *   - Barang besar: quote from the customer's photos before heading out;
 *     "Menuju Lokasi" stays locked until the customer approves.
 *   - Titip beli: tick the list at the store, photograph the receipt, send
 *     the total (never above the limit), deliver once approved, finish with
 *     the customer's PIN.
 */
export default function SendJobTools({ order, userId, onChanged, onQuoteState }) {
  const [adjustments, setAdjustments] = useState([]);
  const titip = order.metadata?.titip || null;
  const job = order.metadata?.job || null;

  // Big item quote form
  const [quoteTotal, setQuoteTotal] = useState('');
  const [quoteDesc, setQuoteDesc] = useState('');
  const [quoting, setQuoting] = useState(false);

  // Titip beli
  const [bought, setBought] = useState(() => (titip?.items || []).map(() => true));
  const [receiptFiles, setReceiptFiles] = useState([]);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [sending, setSending] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('order_adjustments').select('*').eq('order_id', order.id).order('created_at');
    if (!error) setAdjustments(data || []);
  }, [order.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`send-job-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, load]);

  const quote = adjustments.find((a) => a.kind === 'quote' && ['pending', 'approved'].includes(a.status));
  const quoteRejected = adjustments.some((a) => a.kind === 'quote' && a.status === 'rejected');
  const receipt = adjustments.find((a) => a.kind === 'belanja' && ['pending', 'approved'].includes(a.status));

  useEffect(() => { onQuoteState?.(quote?.status === 'approved'); }, [quote?.status, onQuoteState]);

  const sendQuote = async (e) => {
    e.preventDefault();
    const total = Number(String(quoteTotal).replace(/\D/g, ''));
    if (!total) { toast.error('Isi harga antar'); return; }
    if (quoteDesc.trim().length < 3) { toast.error('Tulis rincian singkat'); return; }
    setQuoting(true);
    try {
      await submitBigItemQuote(supabase, order.id, total, quoteDesc.trim());
      toast.success('Penawaran terkirim. Tunggu pelanggan menyetujui.');
      setQuoteTotal('');
      setQuoteDesc('');
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setQuoting(false);
    }
  };

  const sendReceipt = async (e) => {
    e.preventDefault();
    const total = Number(String(receiptTotal).replace(/\D/g, ''));
    if (receiptFiles.length === 0) { toast.error('Tambahkan foto struk'); return; }
    if (String(receiptTotal).trim() === '') { toast.error('Isi total di struk'); return; }
    if (total > Number(titip.budget)) {
      toast.error('Total melebihi batas belanja. Tanyakan pelanggan lewat chat dulu.');
      return;
    }
    setSending(true);
    try {
      const photos = await Promise.all(receiptFiles.map((f) => uploadPrivateImage(supabase, 'order-photos', userId, f)));
      await submitTitipReceipt(supabase, order.id, {
        total,
        photos,
        bought: (titip.items || []).map((it, i) => ({ name: it.name, qty: it.qty, bought: bought[i] !== false })),
        note: receiptNote.trim(),
      });
      toast.success('Struk terkirim ke pelanggan');
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  const deliver = async () => {
    setDelivering(true);
    try {
      await startTitipDelivery(supabase, order.id);
      toast.success('Status: mengantar ke pelanggan');
      onChanged?.();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setDelivering(false);
    }
  };

  const finish = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) { setPinError('PIN harus 4 angka'); return; }
    setFinishing(true);
    setPinError('');
    try {
      const res = await finishTitipWithPin(supabase, order.id, pin);
      if (!res?.success) { setPinError(res?.error || 'PIN tidak valid'); return; }
      toast.success('Pesanan selesai. Terima pembayaran tunai.');
      onChanged?.();
    } catch (err) {
      setPinError(friendlyError(err));
    } finally {
      setFinishing(false);
    }
  };

  if (titip) {
    const goods = Number(receipt?.amount || 0);
    const fee = Number(order.total_price || 0) - (receipt?.status === 'approved' ? goods : 0);
    return (
      <>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ShoppingBasket size={18} className="text-brand-ink" aria-hidden="true" />
            <span className="text-[15px] font-bold text-ink">Titip beli · {titip.store}</span>
            <Badge tone="pay">Batas <Money value={Number(titip.budget)} /></Badge>
          </div>
          <p className="text-[12.5px] text-ink-muted">
            Kalau barang habis: <b className="text-ink">{titip.if_missing === 'skip' ? 'lewati saja' : 'tanya pelanggan lewat chat'}</b>
          </p>
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {(titip.items || []).map((it, i) => {
              const ok = bought[i] !== false;
              const editable = order.status === 'picking_up' && !receipt;
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setBought((list) => list.map((v, j) => (j === i ? !(v !== false) : v)))}
                    className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left', !ok && 'bg-danger-soft')}
                  >
                    {ok ? <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden="true" /> : <Circle size={18} className="shrink-0 text-danger" aria-hidden="true" />}
                    <span className={cx('min-w-0 flex-1 text-[14px] text-ink', !ok && 'text-ink-muted line-through')}>
                      {it.name}{it.note ? <span className="text-ink-muted"> · {it.note}</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[13px] text-ink-muted">{ok ? it.qty : 'habis'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {order.status === 'accepted' && <Notice tone="info">Menuju toko. Ketuk barang yang habis saat belanja, lalu kirim foto struk.</Notice>}
        </Card>

        {order.status === 'picking_up' && !receipt && (
          <Card>
            <form onSubmit={sendReceipt} className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-[14px] font-bold text-ink"><ReceiptText size={18} aria-hidden="true" /> Kirim struk ke pelanggan</p>
              <ReceiptPhotos files={receiptFiles} onChange={setReceiptFiles} />
              <Field label="Total di struk (Rp)" htmlFor="titip-total" required hint={<>Maksimal <Money value={Number(titip.budget)} />. Barang belanjaan tidak kena komisi.</>}>
                <Input
                  id="titip-total"
                  inputMode="numeric"
                  value={receiptTotal === '' ? '' : Number(String(receiptTotal).replace(/\D/g, '') || 0).toLocaleString('id-ID')}
                  onChange={(e) => setReceiptTotal(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="font-mono"
                  placeholder="0"
                />
              </Field>
              <Field label="Catatan (opsional)" htmlFor="titip-note">
                <Textarea id="titip-note" rows={2} maxLength={200} value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} placeholder="Mis. susu diganti merek lain, harga sama" />
              </Field>
              <Button type="submit" size="lg" block isLoading={sending}>Kirim total ke pelanggan</Button>
              <Button type="button" variant="secondary" size="lg" block disabled leftIcon={<Lock size={16} />}>Antar ke pelanggan terkunci</Button>
            </form>
          </Card>
        )}

        {receipt && (
          <Card className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-ink">Struk</span>
              <Badge tone={receipt.status === 'approved' ? 'success' : 'warning'} dot>
                {receipt.status === 'approved' ? 'Disetujui' : 'Menunggu pelanggan'}
              </Badge>
            </div>
            <OrderPhotoThumbs paths={receipt.photos} label="Foto struk" />
            <dl className="flex flex-col gap-1 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Belanja</dt><dd><Money value={goods} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Ongkir</dt><dd><Money value={fee} /></dd></div>
              <div className="flex justify-between gap-3 border-t border-line pt-1 font-semibold"><dt>Tagih tunai</dt><dd><Money value={goods + fee} /></dd></div>
            </dl>
            {receipt.status === 'pending' && (
              <p className="text-[12.5px] leading-relaxed text-ink-muted">Kalau pelanggan tidak menjawab, total disetujui otomatis setelah beberapa menit.</p>
            )}
            {receipt.status === 'approved' && order.status === 'picking_up' && (
              <Button size="lg" block onClick={deliver} isLoading={delivering} leftIcon={<Truck size={18} />}>Antar ke pelanggan</Button>
            )}
          </Card>
        )}

        {order.status === 'in_trip' && (
          <Card>
            <form onSubmit={finish} className="flex flex-col gap-3">
              <p className="text-[14px] font-bold text-ink">Serahkan barang</p>
              <p className="text-[13px] text-ink-muted">Minta PIN 4 angka dari pelanggan, lalu terima <Money value={Number(order.total_price || 0)} /> tunai.</p>
              <Input
                aria-label="PIN pelanggan"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="text-center font-mono text-[22px] tracking-[0.5em]"
                placeholder="••••"
              />
              {pinError && <p className="text-[13px] text-danger-ink">{pinError}</p>}
              <Button type="submit" size="lg" block isLoading={finishing}>Selesaikan pesanan</Button>
            </form>
          </Card>
        )}
      </>
    );
  }

  if (!job) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Truck size={18} className="text-brand-ink" aria-hidden="true" />
        <span className="text-[15px] font-bold text-ink">Barang besar</span>
        {job.helper && <Badge tone="pay">Bantu angkat</Badge>}
      </div>
      <p className="break-words text-[14px] leading-relaxed text-ink">{job.description}</p>
      <OrderPhotoThumbs paths={job.photos} label="Foto barang" />

      {order.status === 'accepted' && !quote && !quoteRejected && (
        <form onSubmit={sendQuote} className="flex flex-col gap-3 border-t border-line pt-3">
          <Field label="Harga antar (Rp)" htmlFor="big-total" required hint="Lihat foto dan jarak. Komisi dihitung dari harga ini.">
            <Input
              id="big-total"
              inputMode="numeric"
              value={quoteTotal === '' ? '' : Number(String(quoteTotal).replace(/\D/g, '') || 0).toLocaleString('id-ID')}
              onChange={(e) => setQuoteTotal(e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="font-mono"
              placeholder="0"
            />
          </Field>
          <Field label="Rincian" htmlFor="big-desc" required>
            <Textarea id="big-desc" rows={2} maxLength={300} value={quoteDesc} onChange={(e) => setQuoteDesc(e.target.value)} placeholder="Mis. antar kulkas + 2 kursi, termasuk bantu angkat" />
          </Field>
          <Button type="submit" size="lg" block isLoading={quoting}>Kirim penawaran</Button>
          <Button type="button" variant="secondary" size="lg" block disabled leftIcon={<Lock size={16} />}>Menuju lokasi terkunci</Button>
        </form>
      )}
      {quote && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13.5px]">
          <span className="text-ink">Penawaran <Money value={Number(quote.amount)} className="font-medium" /></span>
          <Badge tone={quote.status === 'approved' ? 'success' : 'warning'} dot>
            {quote.status === 'approved' ? 'Disetujui, silakan berangkat' : 'Menunggu pelanggan'}
          </Badge>
        </div>
      )}
      {quoteRejected && !quote && <Notice tone="warning">Pelanggan menolak penawaran. Pesanan dibatalkan tanpa biaya.</Notice>}
    </Card>
  );
}
