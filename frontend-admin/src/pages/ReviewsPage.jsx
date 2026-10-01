import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, EyeOff, Eye, MessageSquareReply } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../config/supabase';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, Sheet, Spinner, Textarea } from '../components/ui';

const TAG_LABEL = {
  tepat_waktu: 'Tepat waktu', rapi: 'Rapi & bersih', ramah: 'Ramah', harga_sesuai: 'Harga sesuai',
  ahli: 'Ahli', komunikatif: 'Komunikatif', terlambat: 'Terlambat', kurang_rapi: 'Kurang rapi',
  minta_biaya_tambahan: 'Minta biaya tambahan', tidak_tuntas: 'Tidak tuntas', kurang_sopan: 'Kurang sopan',
};
const NEGATIVE = new Set(['terlambat', 'kurang_rapi', 'minta_biaya_tambahan', 'tidak_tuntas', 'kurang_sopan']);
const SERVICE_LABEL = { ride: 'Ride', send: 'Send', food: 'Food', service: 'Service', pool: 'Pool', villa: 'Villa' };

const Stars = ({ value }) => (
  <span className="inline-flex gap-0.5" aria-label={`${value} dari 5 bintang`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={14} className={n <= value ? 'fill-pay text-pay' : 'fill-sunken text-line-strong'} aria-hidden="true" />
    ))}
  </span>
);

/**
 * Review moderation (migrations/0091): newest reviews across Wira, low
 * ratings to follow up, and hiding a review (abuse, personal data, fake)
 * with a recorded reason. Hidden reviews stop counting toward ratings.
 */
export default function ReviewsPage() {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [target, setTarget] = useState(null); // review being hidden
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('*, order:order_id(title, service_type), merchant:merchant_id(name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error('Gagal memuat ulasan');
      setLoading(false);
      return;
    }
    const ids = [...new Set((data || []).flatMap((r) => [r.user_id, r.driver_id]).filter(Boolean))];
    const { data: users } = ids.length
      ? await supabase.from('users').select('id, name').in('id', ids)
      : { data: [] };
    setNames(Object.fromEntries((users || []).map((u) => [u.id, u.name])));
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => rows.filter((r) => (
    filter === 'low' ? r.rating <= 2 && !r.is_hidden : filter === 'hidden' ? r.is_hidden : true
  )), [rows, filter]);
  const lowCount = rows.filter((r) => r.rating <= 2 && !r.is_hidden).length;

  const setHidden = async (review, hidden, why = null) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_set_review_hidden', { p_review_id: review.id, p_hidden: hidden, p_reason: why });
      if (error) throw error;
      toast.success(hidden ? 'Ulasan disembunyikan' : 'Ulasan ditampilkan lagi');
      setTarget(null);
      setReason('');
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah ulasan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="!mb-0" title="Ulasan" subtitle="Pantau ulasan pelanggan dan sembunyikan yang melanggar aturan." />

      <Segmented
        ariaLabel="Saring ulasan"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Semua' },
          { value: 'low', label: `Rating rendah${lowCount ? ` (${lowCount})` : ''}` },
          { value: 'hidden', label: 'Disembunyikan' },
        ]}
      />

      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted"><Spinner size={16} /> Memuat...</Card>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Star size={24} />} title={filter === 'all' ? 'Belum ada ulasan' : 'Tidak ada ulasan di sini'} />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => {
            const partner = r.driver_id ? names[r.driver_id] : r.merchant?.name;
            return (
              <Card key={r.id} className={r.is_hidden ? 'opacity-70' : ''}>
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-[13px] font-semibold text-ink">{names[r.user_id] || 'Pelanggan'}</span>
                    <span className="text-[12.5px] text-ink-muted">untuk</span>
                    <span className="text-[13px] font-semibold text-ink">{partner || 'Mitra'}</span>
                    {r.order?.service_type && <Badge>{SERVICE_LABEL[r.order.service_type] || r.order.service_type}</Badge>}
                    {r.is_hidden && <Badge tone="danger">Disembunyikan</Badge>}
                    <span className="ml-auto font-mono text-[12px] text-ink-muted">
                      {new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {r.order?.title && <span className="text-[12.5px] text-ink-muted">{r.order.title}</span>}
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
                  {r.partner_reply && (
                    <p className="flex items-start gap-2 rounded-control border border-line bg-sunken px-3 py-2 text-[13px] text-ink">
                      <MessageSquareReply size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                      <span><span className="font-semibold">Balasan mitra: </span>{r.partner_reply}</span>
                    </p>
                  )}
                  {r.is_hidden && r.hidden_reason && (
                    <p className="text-[12.5px] text-danger-ink">Alasan disembunyikan: {r.hidden_reason}</p>
                  )}
                  <div className="flex justify-end">
                    {r.is_hidden ? (
                      <Button size="sm" variant="secondary" leftIcon={<Eye size={15} />} onClick={() => setHidden(r, false)} disabled={busy}>
                        Tampilkan lagi
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger-soft" leftIcon={<EyeOff size={15} />} onClick={() => { setTarget(r); setReason(''); }}>
                        Sembunyikan
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={!!target}
        onClose={() => { if (!busy) setTarget(null); }}
        dismissible={!busy}
        tone="danger"
        size="sm"
        icon={<EyeOff size={22} />}
        title="Sembunyikan ulasan ini?"
        description="Ulasan tidak lagi tampil dan tidak dihitung dalam rating mitra. Pelanggan yang menulisnya masih bisa melihatnya. Gunakan hanya untuk kata kasar, data pribadi, ancaman, atau ulasan palsu."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>Batal</Button>
            <Button variant="danger" onClick={() => setHidden(target, true, reason)} isLoading={busy} disabled={!reason.trim()}>
              Sembunyikan
            </Button>
          </>
        )}
      >
        <Field label="Alasan (dicatat)" htmlFor="hide-reason" required>
          <Textarea id="hide-reason" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Sheet>
    </div>
  );
}
