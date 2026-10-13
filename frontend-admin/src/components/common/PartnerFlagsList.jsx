import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Banknote, Hammer, UserX } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Card, EmptyState, Field, Money, Sheet, Spinner, Textarea, cx } from '../ui';
import { formatDate } from '../../utils/datetime';

const KIND = {
  payment: { icon: Banknote, tone: 'border-l-danger bg-danger-soft', ink: 'text-danger-ink' },
  check_only: { icon: Hammer, tone: 'border-l-warning bg-warning-soft', ink: 'text-warning-ink' },
  absent: { icon: UserX, tone: 'border-l-warning bg-warning-soft', ink: 'text-warning-ink' },
};

function headline(f) {
  if (f.kind === 'payment') return `${f.answer === 'unpaid' ? 'Belum dibayar' : 'Pembayaran tidak sesuai'} · ${f.subject_name || 'mitra'}`;
  if (f.kind === 'check_only') return `Sering selesai di biaya cek · ${f.subject_name || 'teknisi'}`;
  return `Pelanggan sering tidak di lokasi · ${f.subject_name || 'pelanggan'}`;
}

function detail(f) {
  if (f.kind === 'payment') {
    return f.answer === 'unpaid'
      ? <>Pelanggan menjawab belum membayar <Money value={f.expected} />. {f.title}</>
      : <>Pelanggan bilang membayar <Money value={f.amount} />, total di aplikasi <Money value={f.expected} />. {f.title}</>;
  }
  if (f.kind === 'check_only') return `${f.hits} dari ${f.total} "Pekerjaan lain" dalam 30 hari selesai hanya di biaya cek.`;
  return `${f.hits} kunjungan dibatalkan karena pelanggan tidak di lokasi dalam 90 hari.`;
}

/**
 * Partner flags (migrations/0125): customers' payment answers, technicians
 * whose custom jobs keep ending at the check fee, customers often not there.
 * They inform the admin; nothing is blocked automatically.
 */
export default function PartnerFlagsList({ subjectId = null, compact = false, onCount }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [resolving, setResolving] = useState(null); // payment flag
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_partner_flags', { p_subject: subjectId });
    if (error) { setRows([]); onCount?.(0); return; }
    setRows(data || []);
    onCount?.((data || []).length);
  }, [subjectId, onCount]);

  useEffect(() => { load(); }, [load]);

  const snooze = async (f) => {
    const { error } = await supabase.rpc('admin_snooze_flag', { p_subject: f.subject_id, p_kind: f.kind, p_days: 30 });
    if (error) { toast.error(error.message); return; }
    toast.success('Disembunyikan 30 hari');
    load();
  };

  const resolve = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_resolve_payment_check', { p_order_id: resolving.order_id, p_note: note });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ditandai selesai');
    setResolving(null);
    setNote('');
    load();
  };

  if (rows === null) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (rows.length === 0) {
    return compact ? null : (
      <EmptyState title="Tidak ada penanda" description="Belum ada laporan pembayaran atau pola yang perlu dicek." />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((f) => {
        const k = KIND[f.kind];
        const Icon = k.icon;
        return (
          <Card key={`${f.kind}-${f.order_id || f.subject_id}`} className={cx('flex flex-col gap-2 border-l-4', k.tone)}>
            <div className="flex items-start gap-3">
              <Icon size={18} className={cx('mt-0.5 shrink-0', k.ink)} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className={cx('text-[14px] font-semibold', k.ink)}>{headline(f)}</p>
                <p className="text-[13px] leading-relaxed text-ink">{detail(f)}</p>
                <p className="text-[12px] text-ink-muted">{formatDate(f.created_at)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-7">
              {!subjectId && f.subject_id && (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/accounts/${f.subject_id}`)}>
                  {f.kind === 'absent' ? 'Lihat pelanggan' : 'Lihat mitra'}
                </Button>
              )}
              {f.kind === 'payment' ? (
                <Button size="sm" variant="ghost" onClick={() => setResolving(f)}>Tandai selesai</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => snooze(f)}>Abaikan 30 hari</Button>
              )}
            </div>
          </Card>
        );
      })}

      <Sheet
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Tandai laporan selesai"
        description="Catat apa yang sudah dilakukan, mis. sudah menghubungi mitra dan pelanggan."
        footer={<Button block onClick={resolve} isLoading={busy}>Tandai selesai</Button>}
      >
        <Field label="Catatan (opsional)" htmlFor="flag-note">
          <Textarea id="flag-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}
