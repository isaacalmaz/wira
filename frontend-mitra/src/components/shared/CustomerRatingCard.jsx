import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Star, ShieldCheck } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Card, Textarea, cx } from '../ui';
import { friendlyError } from '../../utils/friendlyError';

/**
 * After a finished job the partner rates the customer (migrations/0091).
 * Only Wira admins see it; it helps spot abusive or no-show customers.
 */
export default function CustomerRatingCard({ order }) {
  const [done, setDone] = useState(null); // null = loading
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.from('customer_ratings').select('id').eq('order_id', order.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setDone(!!data); });
    return () => { cancelled = true; };
  }, [order.id]);

  const finishedAt = new Date(order.status_changed_at || order.updated_at || order.created_at).getTime();
  if (done !== false || Date.now() - finishedAt > 14 * 86400000) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('rate_customer', { p_order_id: order.id, p_rating: rating, p_note: note });
      if (error) throw error;
      toast.success('Terima kasih, penilaian tersimpan');
      setDone(true);
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal menyimpan penilaian');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[14px] font-bold text-ink">Bagaimana pelanggan ini?</p>
        <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Hanya dilihat admin Wira, tidak pernah ditampilkan ke pelanggan.
        </p>
      </div>
      <div className="flex gap-1" role="group" aria-label="Nilai pelanggan">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} bintang`}
            aria-pressed={rating >= n}
            className="inline-flex h-11 w-11 items-center justify-center rounded-control"
          >
            <Star size={28} className={cx(rating >= n ? 'fill-pay text-pay' : 'fill-sunken text-line-strong')} />
          </button>
        ))}
      </div>
      {rating > 0 && rating <= 3 && (
        <Textarea
          aria-label="Catatan untuk admin"
          placeholder="Ceritakan singkat untuk admin (opsional)"
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <Button variant="secondary" onClick={submit} disabled={rating === 0} isLoading={saving}>Kirim Penilaian</Button>
    </Card>
  );
}
