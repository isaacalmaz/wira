import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { ImagePlus, ShieldAlert } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { Button, Card, Sheet, Textarea } from '../ui';
import OrderPhotoThumbs from './OrderPhotoThumbs';
import { fetchMyWarrantyClaims, respondWarrantyClaim } from '../../services/stage4Service';
import { uploadPrivateImage } from '../../utils/imageUpload';
import { friendlyError } from '../../utils/friendlyError';

const fmt = (iso) => new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });

/**
 * Warranty claims waiting for this technician (migrations/0132). Accepting
 * creates a free visit (no commission); objecting sends it to the admin,
 * who decides.
 */
export default function WarrantyClaimsCard({ userId, onChanged }) {
  const [claims, setClaims] = useState([]);
  const [busy, setBusy] = useState(null);
  const [objecting, setObjecting] = useState(null);
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState([]);

  const load = useCallback(async () => {
    try { setClaims(await fetchMyWarrantyClaims(supabase, userId)); } catch { /* list stays empty */ }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (claims.length === 0) return null;

  const accept = async (claim) => {
    setBusy(claim.id);
    try {
      await respondWarrantyClaim(supabase, claim.id, true);
      toast.success('Klaim diterima. Kunjungan garansi masuk ke daftar pekerjaan Anda.');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const object = async () => {
    if (reason.trim().length < 5) { toast.error('Tuliskan alasannya'); return; }
    setBusy(objecting.id);
    try {
      const paths = await Promise.all(photos.map((f) => uploadPrivateImage(supabase, 'order-photos', userId, f)));
      await respondWarrantyClaim(supabase, objecting.id, false, reason.trim(), paths);
      toast.success('Keberatan dikirim. Admin Wira yang memutuskan.');
      setObjecting(null); setReason(''); setPhotos([]);
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {claims.map((c) => (
        <Card key={c.id} className="flex flex-col gap-2.5 border-2 border-warning">
          <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <ShieldAlert size={17} className="text-warning" aria-hidden="true" /> Klaim garansi
          </p>
          <p className="break-words text-[13.5px] leading-relaxed text-ink">{c.description}</p>
          <OrderPhotoThumbs paths={c.photos} label="Foto klaim" />
          {c.preferred && <p className="text-[12.5px] text-ink-muted">Waktu yang diminta: {c.preferred}</p>}
          <p className="text-[12.5px] text-ink-muted">Jawab sebelum {fmt(c.response_due)} WITA. Kalau tidak, admin yang memutuskan.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setObjecting(c)} disabled={!!busy}>Bukan karena saya</Button>
            <Button onClick={() => accept(c)} isLoading={busy === c.id} disabled={!!busy}>Terima, datang lagi</Button>
          </div>
          <p className="text-[12px] text-ink-muted">Kunjungan garansi: jasa gratis dan tanpa komisi. Material baru tetap bisa diajukan ke pelanggan.</p>
        </Card>
      ))}
      <Sheet
        open={!!objecting}
        onClose={() => !busy && setObjecting(null)}
        title="Bukan karena pekerjaan saya"
        description="Jelaskan alasannya, tambahkan foto kalau ada. Admin Wira yang memutuskan."
        footer={(
          <>
            <Button variant="secondary" size="lg" onClick={() => setObjecting(null)} disabled={!!busy}>Batal</Button>
            <Button size="lg" onClick={object} isLoading={!!busy}>Kirim keberatan</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <Textarea aria-label="Alasan" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: kebocoran dari pipa baru yang dipasang orang lain." />
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((f, i) => <span key={i} className="rounded-full border border-line px-2.5 py-1 text-[12px]">{f.name}</span>)}
            {photos.length < 3 && (
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 text-[12.5px] text-ink-muted">
                <ImagePlus size={15} aria-hidden="true" /> Foto
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos((p) => [...p, f]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
