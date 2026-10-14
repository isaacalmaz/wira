import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ClipboardList, ReceiptText, SearchCheck, Lock, Tag, UserX, Hammer } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, Field, Input, Money, Segmented, Sheet, Textarea, cx } from '../ui';
import { cancelAdjustment, finishAsCheck, reportCustomerAbsent, requestAdjustment, submitVisitQuote } from '../../services/technicianService';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { friendlyError } from '../../utils/friendlyError';
import { WALLET_ENABLED } from '../../config/wallet';

const ADJ_STATUS = {
  pending: { tone: 'warning', label: 'Menunggu pelanggan' },
  approved: { tone: 'success', label: 'Disetujui' },
  rejected: { tone: 'danger', label: 'Ditolak' },
  cancelled: { tone: 'neutral', label: 'Dibatalkan' },
};

/**
 * The technician's tools on a visit (migrations/0090): what was booked, extra
 * charges for materials or extra work (the customer approves in their app),
 * and finishing at the check fee when the customer declines after the check.
 */
export default function VisitTools({ order, onFinished, onQuoteState }) {
  const [adjustments, setAdjustments] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const [kind, setKind] = useState('material');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [sending, setSending] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [finishing, setFinishing] = useState(false);
  // "Pekerjaan lain" quote (migrations/0123)
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteTotal, setQuoteTotal] = useState('');
  const [quoteDesc, setQuoteDesc] = useState('');
  const [quoting, setQuoting] = useState(false);
  // Customer not there (migrations/0123)
  const [absentOpen, setAbsentOpen] = useState(false);
  const [absentNote, setAbsentNote] = useState('');
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('order_adjustments')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at');
    if (!error) setAdjustments(data || []);
  }, [order.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`tech-adjustments-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_adjustments', filter: `order_id=eq.${order.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.id, load]);

  const items = Array.isArray(order.metadata?.items) ? order.metadata.items : [];
  const onSite = ['on_the_way', 'working'].includes(order.status);
  const canCheckFinish = ['accepted', 'on_the_way'].includes(order.status);
  const hasPending = adjustments.some((a) => a.status === 'pending');
  const paidOnline = ['wallet', 'qris'].includes(order.payment_method) && order.payment_status === 'paid';
  // While WiraPay is off, extras on a QRIS-paid order are paid to you in cash (migrations/0135).
  const extrasFromWallet = paidOnline && WALLET_ENABLED;
  const job = order.metadata?.job || null;
  const jobBase = Number(job?.base || 0);
  const quoteApproved = adjustments.some((a) => a.kind === 'quote' && a.status === 'approved');
  // "Pekerjaan lain": the price quote comes first; extras only after the
  // customer approved it (the server refuses them before, migrations/0136).
  const extrasLocked = !!job && !quoteApproved;
  const quotePending = adjustments.find((a) => a.kind === 'quote' && a.status === 'pending') || null;

  // Tell the page whether "Mulai Bekerja" may unlock.
  useEffect(() => { onQuoteState?.(quoteApproved); }, [quoteApproved, onQuoteState]);

  const submitQuote = async (e) => {
    e.preventDefault();
    const value = Math.round(Number(quoteTotal));
    if (!Number.isFinite(value) || value < jobBase || value > 5000000) {
      toast.error(`Isi harga antara ${jobBase.toLocaleString('id-ID')} dan 5.000.000`);
      return;
    }
    setQuoting(true);
    try {
      await submitVisitQuote(supabase, order.id, value, quoteDesc.trim());
      toast.success('Penawaran terkirim. Tunggu persetujuan pelanggan.');
      setQuoteOpen(false);
      setQuoteTotal('');
      setQuoteDesc('');
      load();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengirim penawaran');
    } finally {
      setQuoting(false);
    }
  };

  const submitAbsent = async (e) => {
    e.preventDefault();
    setReporting(true);
    try {
      await reportCustomerAbsent(supabase, order.id, absentNote.trim());
      toast.success('Dilaporkan. Pesanan dibatalkan tanpa biaya.');
      setAbsentOpen(false);
      onFinished?.();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal melapor');
    } finally {
      setReporting(false);
    }
  };

  const submitAsk = async (e) => {
    e.preventDefault();
    const value = Math.round(Number(amount));
    if (!value || value < 1000) { toast.error('Isi nominal minimal Rp 1.000'); return; }
    setSending(true);
    try {
      await requestAdjustment(supabase, order.id, kind, value, desc.trim());
      toast.success('Pengajuan terkirim ke pelanggan');
      setAskOpen(false);
      setAmount('');
      setDesc('');
      load();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengirim pengajuan');
    } finally {
      setSending(false);
    }
  };

  const submitCheck = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    setFinishing(true);
    setPinError('');
    try {
      const res = await finishAsCheck(supabase, order.id, pin);
      if (!res?.success) {
        setPinError(res?.error || 'PIN salah');
        return;
      }
      toast.success('Kunjungan selesai sebagai pengecekan');
      setCheckOpen(false);
      onFinished?.();
    } catch (err) {
      setPinError(err.message);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <>
      {job && (
        <Card className="flex flex-col gap-3 border-brand-line">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Hammer size={16} className="text-ink-muted" aria-hidden="true" /> Pekerjaan lain dari pelanggan
          </p>
          <p className="break-words text-[14px] leading-relaxed text-ink">{job.description}</p>
          <OrderPhotoThumbs paths={job.photos} label="Foto pekerjaan" />
          {quoteApproved ? (
            <Badge tone="success" className="self-start">Harga disetujui pelanggan</Badge>
          ) : quotePending ? (
            <div className="flex items-center justify-between gap-3 rounded-control bg-warning-soft px-3 py-2.5 text-[13px] text-warning-ink">
              <span>Menunggu pelanggan menyetujui <Money value={Number(quotePending.amount) + jobBase} /></span>
              <button
                type="button"
                className="min-h-9 shrink-0 font-semibold"
                onClick={async () => {
                  try { await cancelAdjustment(supabase, quotePending.id); load(); } catch (err) { toast.error(friendlyError(err)); }
                }}
              >
                Ubah
              </button>
            </div>
          ) : order.status === 'on_the_way' ? (
            <>
              <Button block leftIcon={<Tag size={17} />} onClick={() => setQuoteOpen(true)}>Kirim Penawaran Harga</Button>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                Cek dulu di lokasi, lalu kirim harga jasanya. Mulai Bekerja terbuka setelah pelanggan setuju.
              </p>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-muted">
              Tekan Berangkat ke Lokasi. Harga dikirim setelah Anda melihat pekerjaannya langsung.
            </p>
          )}
        </Card>
      )}

      {items.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <ClipboardList size={16} className="text-ink-muted" aria-hidden="true" /> Pekerjaan yang dipesan
          </p>
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {items.map((it) => (
              <li key={it.code} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-ink"><span className="font-mono text-ink-muted">{it.qty}×</span> {it.name}</span>
                <Money value={Number(it.price) * Number(it.qty)} className="shrink-0 text-ink" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(onSite || adjustments.length > 0) && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-ink-muted" aria-hidden="true" />
            <p className="flex-1 text-[13px] font-semibold text-ink">Biaya tambahan</p>
          </div>
          {adjustments.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line">
              {adjustments.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="break-words text-[13.5px] text-ink">{a.description}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ADJ_STATUS[a.status]?.tone}>{ADJ_STATUS[a.status]?.label}</Badge>
                      <span className="text-[12px] text-ink-muted">{a.kind === 'material' ? 'Bahan, tanpa komisi' : a.kind === 'quote' ? 'Penawaran pekerjaan lain' : 'Jasa'}</span>
                    </span>
                    {a.status === 'approved' && a.paid_cash && (
                      <span className="text-[12.5px] font-semibold text-brand-ink">Terima tunai dari pelanggan</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Money value={Number(a.amount) + (a.kind === 'quote' ? jobBase : 0)} className="text-[14px] font-medium text-ink" />
                    {a.status === 'pending' && (
                      <button
                        type="button"
                        className="min-h-9 text-[12.5px] font-semibold text-danger-ink"
                        onClick={async () => {
                          try { await cancelAdjustment(supabase, a.id); load(); } catch (err) { toast.error(friendlyError(err)); }
                        }}
                      >
                        Batalkan
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              {extrasLocked ? (
                'Kirim penawaran harga dulu. Setelah pelanggan menyetujui harga, bahan atau biaya lain bisa diajukan di sini.'
              ) : (
                <>
                  Butuh bahan, suku cadang atau pekerjaan di luar pesanan? Ajukan di sini. Pelanggan menyetujuinya di aplikasi
                  {extrasFromWallet ? ' dan langsung terbayar dari saldo WiraPay-nya.' : ', lalu membayar tunai ke Anda.'}
                </>
              )}
            </p>
          )}
          {onSite && !extrasLocked && (
            <Button variant="secondary" block onClick={() => setAskOpen(true)} disabled={hasPending}>
              {hasPending ? 'Menunggu jawaban pelanggan' : 'Ajukan Biaya Tambahan'}
            </Button>
          )}
        </Card>
      )}

      {canCheckFinish && (
        <Button variant="ghost" block leftIcon={<SearchCheck size={17} />} onClick={() => setCheckOpen(true)}>
          Pelanggan batal setelah dicek
        </Button>
      )}

      {canCheckFinish && (
        <Button variant="ghost" block leftIcon={<UserX size={17} />} onClick={() => setAbsentOpen(true)} className="text-danger-ink">
          Pelanggan tidak ada di lokasi
        </Button>
      )}

      <Sheet
        open={quoteOpen}
        onClose={() => { if (!quoting) setQuoteOpen(false); }}
        dismissible={!quoting}
        icon={<Tag size={22} />}
        title="Kirim penawaran harga"
        description="Total harga jasa untuk pekerjaan lain, sudah termasuk biaya cek. Material diajukan terpisah lewat Ajukan Biaya Tambahan."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setQuoteOpen(false)} disabled={quoting}>Batal</Button>
            <Button type="submit" form="quote-form" isLoading={quoting}>Kirim ke Pelanggan</Button>
          </>
        )}
      >
        <form id="quote-form" onSubmit={submitQuote} className="flex flex-col gap-4">
          <Field
            label="Total harga jasa (Rp)"
            htmlFor="quote-total"
            required
            hint={`Minimal ${jobBase.toLocaleString('id-ID')}, maksimal 5.000.000. Komisi dihitung dari harga jasa.`}
          >
            <Input
              id="quote-total"
              type="number"
              inputMode="numeric"
              min={jobBase}
              max={5000000}
              step={1000}
              value={quoteTotal}
              onChange={(e) => setQuoteTotal(e.target.value)}
              className="font-mono"
              required
            />
          </Field>
          <Field label="Rincian pekerjaan" htmlFor="quote-desc" required hint="Contoh: ganti kran + pindah pipa buangan 1 m, termasuk lem dan sambungan">
            <Textarea id="quote-desc" rows={2} maxLength={300} value={quoteDesc} onChange={(e) => setQuoteDesc(e.target.value)} required />
          </Field>
        </form>
      </Sheet>

      <Sheet
        open={absentOpen}
        onClose={() => { if (!reporting) setAbsentOpen(false); }}
        dismissible={!reporting}
        size="sm"
        tone="danger"
        icon={<UserX size={22} />}
        title="Pelanggan tidak ada di lokasi?"
        description="Bisa dilaporkan 15 menit setelah jadwal. Pesanan dibatalkan tanpa biaya dan tanpa komisi; admin Wira diberi tahu. Coba hubungi pelanggan lewat chat dulu."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAbsentOpen(false)} disabled={reporting}>Kembali</Button>
            <Button variant="danger" type="submit" form="absent-form" isLoading={reporting}>Laporkan</Button>
          </>
        )}
      >
        <form id="absent-form" onSubmit={submitAbsent} className="flex flex-col gap-2">
          <Field label="Catatan (opsional)" htmlFor="absent-note" hint="Contoh: rumah dikunci, telepon lewat chat tidak dijawab">
            <Textarea id="absent-note" rows={2} maxLength={300} value={absentNote} onChange={(e) => setAbsentNote(e.target.value)} />
          </Field>
        </form>
      </Sheet>

      <Sheet
        open={askOpen}
        onClose={() => { if (!sending) setAskOpen(false); }}
        dismissible={!sending}
        icon={<ReceiptText size={22} />}
        title="Ajukan biaya tambahan"
        description="Jelaskan dengan jelas. Pelanggan melihat rincian ini sebelum menyetujui."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAskOpen(false)} disabled={sending}>Batal</Button>
            <Button type="submit" form="adjust-form" isLoading={sending}>Kirim ke Pelanggan</Button>
          </>
        )}
      >
        <form id="adjust-form" onSubmit={submitAsk} className="flex flex-col gap-4">
          <Segmented
            ariaLabel="Jenis biaya"
            value={kind}
            onChange={setKind}
            className="w-full"
            options={[{ value: 'material', label: 'Bahan / suku cadang' }, { value: 'jasa', label: 'Jasa tambahan' }]}
          />
          <p className="-mt-2 text-[12px] text-ink-muted">
            {kind === 'material' ? 'Harga bahan sesuai yang Anda bayar; Wira tidak memotong komisi.' : 'Pekerjaan di luar pesanan; dipotong komisi seperti biasa.'}
          </p>
          <Field label="Nominal (Rp)" htmlFor="adjust-amount" required>
            <Input
              id="adjust-amount"
              type="number"
              inputMode="numeric"
              min={1000}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
              required
            />
          </Field>
          <Field label="Rincian" htmlFor="adjust-desc" required hint="Contoh: Freon R32 1 kg, atau ganti kapasitor outdoor">
            <Textarea id="adjust-desc" rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} required />
          </Field>
        </form>
      </Sheet>

      <Sheet
        open={checkOpen}
        onClose={() => { if (!finishing) { setCheckOpen(false); setPin(''); setPinError(''); } }}
        dismissible={!finishing}
        size="sm"
        icon={<Lock size={22} />}
        title="Selesai sebagai pengecekan"
        description="Pelanggan memutuskan tidak melanjutkan setelah Anda cek. Pesanan selesai dengan biaya cek; sisanya dikembalikan ke pelanggan. Minta PIN pelanggan sebagai tanda setuju."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCheckOpen(false)} disabled={finishing}>Kembali</Button>
            <Button type="submit" form="check-form" isLoading={finishing} disabled={pin.length !== 4}>Selesaikan</Button>
          </>
        )}
      >
        <form id="check-form" onSubmit={submitCheck} className="flex flex-col gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="one-time-code"
            aria-label="PIN pelanggan"
            aria-invalid={!!pinError}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="----"
            className={cx(
              'block w-full rounded-control border-2 bg-card py-3 pl-[0.5em] text-center font-mono text-[32px] font-medium tracking-[0.5em] text-ink placeholder:text-ink-muted/50 focus:ring-2',
              pinError ? 'border-danger focus:border-danger focus:ring-danger/20' : 'border-line-strong focus:border-brand focus:ring-brand/20',
            )}
          />
          {pinError && <p className="text-center text-sm text-danger-ink">{pinError}</p>}
        </form>
      </Sheet>
    </>
  );
}
