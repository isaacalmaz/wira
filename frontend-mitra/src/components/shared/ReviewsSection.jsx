import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { MessageSquareReply, Star } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Badge, Button, Card, EmptyState, Field, Sheet, Textarea } from '../ui';
import { friendlyError } from '../../utils/friendlyError';
import { formatDate } from '../../utils/datetime';

// Same codes as the customer app (migrations/0091 review_tag_list).
export const TAG_LABEL = {
  tepat_waktu: 'Tepat waktu', rapi: 'Rapi & bersih', ramah: 'Ramah', harga_sesuai: 'Harga sesuai',
  ahli: 'Ahli di bidangnya', komunikatif: 'Komunikatif', terlambat: 'Terlambat', kurang_rapi: 'Kurang rapi',
  minta_biaya_tambahan: 'Minta biaya tambahan', tidak_tuntas: 'Pekerjaan tidak tuntas', kurang_sopan: 'Kurang sopan',
};
const NEGATIVE = new Set(['terlambat', 'kurang_rapi', 'minta_biaya_tambahan', 'tidak_tuntas', 'kurang_sopan']);

const Stars = ({ value, size = 14 }) => (
  <span className="inline-flex gap-0.5" aria-label={`${value} dari 5 bintang`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size} className={n <= value ? 'fill-pay text-pay' : 'fill-sunken text-line-strong'} aria-hidden="true" />
    ))}
  </span>
);

/**
 * A partner's rating and reviews with one public reply per review
 * (migrations/0091). The rating is shown once there are 3 reviews.
 */
export default function ReviewsSection({ userId }) {
  const [summary, setSummary] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: stats }, { data: rows }] = await Promise.all([
      supabase.rpc('partner_rating', { p_user_id: userId }),
      supabase.rpc('get_partner_reviews', { p_partner_id: userId, p_limit: 30 }),
    ]);
    setSummary(stats?.[0] || null);
    setReviews(rows || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const sendReply = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.rpc('reply_to_review', { p_review_id: replyTo.id, p_reply: reply });
      if (error) throw error;
      toast.success('Balasan terkirim');
      setReplyTo(null);
      setReply('');
      load();
    } catch (err) {
      toast.error(friendlyError(err) || 'Gagal mengirim balasan');
    } finally {
      setSaving(false);
    }
  };

  const count = summary?.rating_count || 0;

  return (
    <Card padding="none">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Ulasan Pelanggan</h2>
          {count >= 3 ? (
            <span className="flex flex-wrap items-center gap-2">
              <Stars value={Math.round(Number(summary.rating_avg))} />
              <span className="font-mono text-[14px] font-medium text-ink">{Number(summary.rating_avg).toFixed(1)}</span>
              <span className="text-[12.5px] text-ink-muted">({count} ulasan)</span>
              {summary.top_rated && <Badge tone="pay">Top Rated</Badge>}
            </span>
          ) : (
            <span className="text-[12.5px] text-ink-muted">
              {count === 0 ? 'Belum ada ulasan.' : `${count} ulasan.`} Rating tampil ke pelanggan setelah 3 ulasan.
            </span>
          )}
        </div>
      </div>

      {loading ? null : reviews.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<Star size={24} />} title="Belum ada ulasan" description="Selesaikan pekerjaan dengan rapi dan tepat waktu; pelanggan bisa mengulas sampai 14 hari setelahnya." />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-[13px] font-semibold text-ink">{r.reviewer_name}</span>
                <span className="text-[12px] text-ink-muted">
                  {formatDate(r.created_at)}
                </span>
              </div>
              {r.order_title && <span className="text-[12px] text-ink-muted">{r.order_title}</span>}
              {r.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.tags.map((tag) => <Badge key={tag} tone={NEGATIVE.has(tag) ? 'danger' : 'success'}>{TAG_LABEL[tag] || tag}</Badge>)}
                </div>
              )}
              {r.review_text && <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink">{r.review_text}</p>}
              {r.photos?.length > 0 && (
                <div className="flex gap-2">
                  {r.photos.map((src, i) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-control border border-line">
                      <img src={src} alt={`Foto ulasan ${i + 1}`} className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {r.partner_reply ? (
                <div className="rounded-control border border-line bg-sunken px-3 py-2 text-[13px] leading-relaxed text-ink">
                  <span className="font-semibold">Balasan Anda: </span>{r.partner_reply}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  leftIcon={<MessageSquareReply size={15} />}
                  onClick={() => { setReplyTo(r); setReply(''); }}
                >
                  Balas
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!replyTo}
        onClose={() => { if (!saving) setReplyTo(null); }}
        dismissible={!saving}
        title="Balas ulasan"
        description="Balasan tampil di bawah ulasan dan hanya bisa dikirim sekali. Tetap sopan; ucapkan terima kasih atau jelaskan dengan tenang."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setReplyTo(null)} disabled={saving}>Batal</Button>
            <Button type="submit" form="review-reply-form" isLoading={saving} disabled={!reply.trim()}>Kirim Balasan</Button>
          </>
        )}
      >
        <form id="review-reply-form" onSubmit={sendReply}>
          <Field label="Balasan" htmlFor="review-reply">
            <Textarea id="review-reply" rows={3} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} />
          </Field>
        </form>
      </Sheet>
    </Card>
  );
}
