import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ClipboardList, ReceiptText, SearchCheck, Lock } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, Field, Input, Money, Segmented, Sheet, Textarea, cx } from '../ui';
import { cancelAdjustment, finishAsCheck, requestAdjustment } from '../../services/technicianService';
import { friendlyError } from '../../utils/friendlyError';

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
export default function VisitTools({ order, onFinished }) {
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
                      <span className="text-[12px] text-ink-muted">{a.kind === 'material' ? 'Bahan, tanpa komisi' : 'Jasa'}</span>
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Money value={Number(a.amount)} className="text-[14px] font-medium text-ink" />
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
              Butuh bahan, suku cadang atau pekerjaan di luar pesanan? Ajukan di sini. Pelanggan menyetujuinya di aplikasi
              {paidOnline ? ' dan langsung terbayar dari saldo WiraPay-nya.' : ', lalu membayar tunai ke Anda.'}
            </p>
          )}
          {onSite && (
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
