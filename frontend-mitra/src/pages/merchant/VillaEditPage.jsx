import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Star, Trash2, Send, Save, Check } from 'lucide-react';
import { Card, Button, Field, Input, Textarea, PageHeader, Spinner, Notice, Badge, cx } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { AMENITY_PRESETS, MAX_PHOTOS, listingState } from './villaShared';
import { friendlyError } from '../../utils/friendlyError';

const EMPTY = { name: '', address: '', price: '', bedrooms: '', guests: '', description: '' };

/**
 * Add a property (/villa/listing/new, goes to admin review through
 * create_villa_listing) or edit one (/villa/listing/:id). Photos upload to
 * the villa-photos bucket under the host's folder; the first one is the
 * cover guests see (migration 0097).
 */
export default function VillaEditPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef(null);

  const [listing, setListing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [amenities, setAmenities] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data } = await supabase.from('merchants').select('*').eq('id', id).eq('owner_id', user.id).maybeSingle();
      if (data) {
        setListing(data);
        setForm({
          name: data.name || '',
          address: data.address || '',
          price: data.price_per_night ?? '',
          bedrooms: data.bedrooms ?? '',
          guests: data.max_guests ?? '',
          description: data.description || '',
        });
        setAmenities(data.amenities || []);
        setPhotos(data.photos || []);
      }
      setLoading(false);
    })();
  }, [id, isNew, user]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleAmenity = (a) => setAmenities((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - photos.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        urls.push(await uploadImageToBucket(supabase, 'villa-photos', user.id, file, { maxDim: 1400, quality: 0.8 }));
      }
      setPhotos((p) => [...p, ...urls].slice(0, MAX_PHOTOS));
    } catch (err) {
      toast.error('Gagal mengunggah foto: ' + friendlyError(err));
    } finally {
      setUploading(false);
    }
  };

  const makeCover = (i) => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)]);
  const removePhoto = (i) => setPhotos((p) => p.filter((_, j) => j !== i));

  const validate = () => {
    if (form.name.trim().length < 3) return 'Nama properti minimal 3 karakter';
    if (form.address.trim().length < 5) return 'Alamat properti wajib diisi';
    const price = Number(form.price);
    if (!price || price < 50000) return 'Harga per malam minimal Rp 50.000';
    if (isNew && photos.length === 0) return 'Tambahkan minimal satu foto';
    return null;
  };

  const intOrNull = (v) => (v === '' || v === null ? null : Math.max(0, Math.round(Number(v))));

  const save = async (resubmit = false) => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.rpc('create_villa_listing', {
          p_name: form.name.trim(),
          p_address: form.address.trim(),
          p_price_per_night: Number(form.price),
          p_description: form.description.trim(),
          p_bedrooms: intOrNull(form.bedrooms),
          p_max_guests: intOrNull(form.guests) || null,
          p_amenities: amenities.length ? amenities : null,
          p_photos: photos,
        });
        if (error) throw error;
        toast.success('Properti diajukan. Admin akan meninjau sebelum tayang.');
        navigate('/villa/listing');
        return;
      }
      const { data, error } = await supabase
        .from('merchants')
        .update({
          name: form.name.trim(),
          address: form.address.trim(),
          price_per_night: Number(form.price),
          description: form.description.trim() || null,
          bedrooms: intOrNull(form.bedrooms),
          max_guests: intOrNull(form.guests) || null,
          amenities: amenities.length ? amenities : null,
          photos,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau properti tidak ditemukan.');
      if (resubmit) {
        const { error: rErr } = await supabase.rpc('resubmit_villa_listing', { p_id: id });
        if (rErr) throw rErr;
        toast.success('Perbaikan dikirim. Admin akan meninjau lagi.');
      } else {
        toast.success('Perubahan disimpan');
      }
      navigate('/villa/listing');
    } catch (err) {
      toast.error('Gagal menyimpan: ' + friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status">
        <Spinner size={24} className="text-brand-ink" />
        <p className="text-sm">Memuat properti...</p>
      </div>
    );
  }

  if (!isNew && !listing) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Notice tone="warning" title="Properti tidak ditemukan">Properti ini bukan milik akun Anda atau sudah dihapus.</Notice>
        <Button variant="secondary" leftIcon={<ArrowLeft size={18} />} onClick={() => navigate('/villa/listing')}>Kembali</Button>
      </div>
    );
  }

  const state = listing ? listingState(listing) : null;
  const legacyCover = !photos.length && listing?.image;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-24">
      <PageHeader
        back="/villa/listing"
        title={isNew ? 'Tambah Properti' : 'Ubah Properti'}
        subtitle={isNew ? 'Diajukan ke admin, tayang setelah disetujui' : undefined}
        className="mb-0"
        actions={state ? <Badge tone={state.tone} dot>{state.label}</Badge> : null}
      />

      {listing?.listing_status === 'rejected' && listing.review_note && (
        <Notice tone="danger" title="Catatan admin">{listing.review_note}</Notice>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-bold text-ink">Foto</h2>
          <span className="font-mono text-[12px] text-ink-muted">{photos.length}/{MAX_PHOTOS}</span>
        </div>
        <p className="text-[13px] text-ink-muted">Foto pertama menjadi sampul. Tampilkan kamar, kamar mandi, kolam, dan pemandangan.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {legacyCover && (
            <div className="relative aspect-square overflow-hidden rounded-control border border-line">
              <img src={listing.image} alt="Sampul saat ini" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5"><Badge tone="brand">Sampul</Badge></span>
            </div>
          )}
          {photos.map((url, i) => (
            <div key={url} className={cx('relative aspect-square overflow-hidden rounded-control border', i === 0 ? 'border-2 border-brand' : 'border-line')}>
              <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5"><Badge tone="brand">Sampul</Badge></span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                {i !== 0 && (
                  <button type="button" onClick={() => makeCover(i)} aria-label={`Jadikan foto ${i + 1} sampul`} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink">
                    <Star size={15} />
                  </button>
                )}
                <button type="button" onClick={() => removePhoto(i)} aria-label={`Hapus foto ${i + 1}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-danger-ink">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong text-ink-muted transition-colors hover:bg-sunken"
            >
              {uploading ? <Spinner size={20} /> : <Camera size={22} aria-hidden="true" />}
              <span className="text-[12px] font-medium">{uploading ? 'Mengunggah...' : 'Tambah foto'}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Nama Properti" htmlFor="villa-name" required>
          <Input id="villa-name" value={form.name} onChange={set('name')} maxLength={80} placeholder="Contoh: Villa Senggigi Sunset" />
        </Field>
        <Field label="Alamat" htmlFor="villa-address" required>
          <Input id="villa-address" value={form.address} onChange={set('address')} placeholder="Contoh: Jl. Raya Senggigi, Lombok Barat" />
        </Field>
        <Field label="Harga per Malam (Rp)" htmlFor="villa-price" required>
          <Input id="villa-price" type="number" inputMode="numeric" min="50000" step="1000" value={form.price} onChange={set('price')} className="font-mono" placeholder="850000" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kamar Tidur" htmlFor="villa-bedrooms">
            <Input id="villa-bedrooms" type="number" inputMode="numeric" min="0" max="50" value={form.bedrooms} onChange={set('bedrooms')} className="font-mono" placeholder="2" />
          </Field>
          <Field label="Maks. Tamu" htmlFor="villa-guests">
            <Input id="villa-guests" type="number" inputMode="numeric" min="1" max="100" value={form.guests} onChange={set('guests')} className="font-mono" placeholder="4" />
          </Field>
        </div>
        <Field label="Deskripsi" htmlFor="villa-description">
          <Textarea id="villa-description" value={form.description} onChange={set('description')} rows={4} placeholder="Suasana, jarak ke pantai, aturan rumah..." />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold text-ink">Fasilitas</h2>
        <div className="flex flex-wrap gap-2">
          {AMENITY_PRESETS.map((a) => {
            const on = amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => toggleAmenity(a)}
                className={cx(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-card text-ink hover:border-line-strong',
                )}
              >
                {on && <Check size={14} aria-hidden="true" />}
                {a}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        {listing?.listing_status === 'rejected' ? (
          <>
            <Button variant="primary" size="lg" block isLoading={saving} leftIcon={<Send size={18} />} onClick={() => save(true)}>
              Simpan & Ajukan Ulang
            </Button>
            <Button variant="secondary" size="lg" block disabled={saving} onClick={() => save(false)}>Simpan saja</Button>
          </>
        ) : (
          <Button variant="primary" size="lg" block isLoading={saving} disabled={uploading} leftIcon={isNew ? <Send size={18} /> : <Save size={18} />} onClick={() => save(false)}>
            {isNew ? 'Ajukan Properti' : 'Simpan Perubahan'}
          </Button>
        )}
      </div>
    </div>
  );
}
