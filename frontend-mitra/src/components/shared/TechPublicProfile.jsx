import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { BadgeCheck, Image as ImageIcon, ImagePlus, MapPin, Languages, Pencil, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { uploadImageToBucket } from '../../utils/imageUpload';
import { Badge, Button, Card, EmptyState, Field, Sheet, Textarea, cx } from '../ui';

// Same lists as migrations/0092 (service_area_list, language_list).
export const SERVICE_AREAS = ['Mataram', 'Lombok Barat', 'Senggigi', 'Lombok Utara', 'Gili', 'Lombok Tengah', 'Kuta Mandalika', 'Lombok Timur'];
export const LANGUAGES = { id: 'Bahasa Indonesia', sasak: 'Bahasa Sasak', en: 'English' };
const MAX_PORTFOLIO = 12;

const Chip = ({ on, onClick, children }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={on}
    onClick={onClick}
    className={cx(
      'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
      on ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink hover:border-line-strong',
    )}
  >
    {children}
  </button>
);

/**
 * What customers see on the technician's public profile (migrations/0092):
 * bio, service areas, languages and a portfolio of up to 12 photos. The
 * verified badge is set by Wira admins after checking KTP and selfie.
 */
export default function TechPublicProfile({ userId }) {
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ bio: '', service_areas: [], languages: ['id'] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: rows }] = await Promise.all([
      supabase.from('technician_profiles').select('bio, service_areas, languages, verified_at').eq('user_id', userId).maybeSingle(),
      supabase.from('technician_portfolio').select('id, image_url, caption').eq('user_id', userId).order('created_at'),
    ]);
    setProfile(p || null);
    setPhotos(rows || []);
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const openEdit = () => {
    setDraft({ bio: profile?.bio || '', service_areas: profile?.service_areas || [], languages: profile?.languages || ['id'] });
    setEditOpen(true);
  };

  const toggle = (key, value) => setDraft((d) => ({
    ...d,
    [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
  }));

  const save = async (e) => {
    e.preventDefault();
    if (draft.service_areas.length === 0) { toast.error('Pilih minimal satu wilayah layanan'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('technician_profiles')
        .update({ bio: draft.bio, service_areas: draft.service_areas, languages: draft.languages })
        .eq('user_id', userId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Profil tidak bisa disimpan.');
      toast.success('Profil disimpan');
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/')).slice(0, MAX_PORTFOLIO - photos.length);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadImageToBucket(supabase, 'portfolio', userId, file);
        const { data, error } = await supabase.from('technician_portfolio').insert({ user_id: userId, image_url: url }).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Foto tidak bisa disimpan.');
      }
      toast.success('Foto portofolio ditambahkan');
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal mengunggah foto');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo) => {
    const { data, error } = await supabase.from('technician_portfolio').delete().eq('id', photo.id).select('id');
    if (error || !data || data.length === 0) {
      toast.error('Foto tidak bisa dihapus');
      return;
    }
    // Best effort: also remove the file from storage.
    const path = photo.image_url.split('/storage/v1/object/public/portfolio/')[1];
    if (path) supabase.storage.from('portfolio').remove([path]);
    setPhotos((cur) => cur.filter((p) => p.id !== photo.id));
  };

  const setCaption = async (photo, caption) => {
    if ((caption || '') === (photo.caption || '')) return;
    const { error } = await supabase.from('technician_portfolio').update({ caption: caption || null }).eq('id', photo.id).select('id');
    if (error) toast.error('Keterangan tidak tersimpan');
  };

  const verified = !!profile?.verified_at;

  return (
    <>
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            <UserRound size={17} className="text-ink-muted" aria-hidden="true" /> Profil Publik
          </h2>
          <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={openEdit} disabled={!profile}>Ubah</Button>
        </div>
        {verified ? (
          <Badge tone="success" className="self-start"><BadgeCheck size={13} aria-hidden="true" /> Terverifikasi Wira</Badge>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-ink-muted">Belum terverifikasi. Admin Wira memeriksa KTP dan selfie Anda; setelah itu badge Terverifikasi tampil di profil.</p>
        )}
        <p className={cx('whitespace-pre-line text-[13.5px] leading-relaxed', profile?.bio ? 'text-ink' : 'text-ink-muted')}>
          {profile?.bio || 'Belum ada bio. Ceritakan pengalaman dan keahlian Anda supaya pelanggan yakin memilih Anda.'}
        </p>
        <p className="flex items-start gap-2 text-[13px] text-ink">
          <MapPin size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          {profile?.service_areas?.length ? profile.service_areas.join(', ') : <span className="text-ink-muted">Wilayah layanan belum dipilih</span>}
        </p>
        <p className="flex items-start gap-2 text-[13px] text-ink">
          <Languages size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          {(profile?.languages || []).map((l) => LANGUAGES[l] || l).join(', ') || '-'}
        </p>
      </Card>

      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            <ImageIcon size={17} className="text-ink-muted" aria-hidden="true" /> Portofolio Hasil Kerja
          </h2>
          <span className="font-mono text-[12px] text-ink-muted">{photos.length}/{MAX_PORTFOLIO}</span>
        </div>
        {photos.length === 0 && (
          <EmptyState
            icon={<ImageIcon size={24} />}
            title="Belum ada foto portofolio"
            description="Foto sebelum-sesudah pekerjaan Anda membuat pelanggan lebih percaya."
            className="py-6"
          />
        )}
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5">
                <div className="relative aspect-square overflow-hidden rounded-control border border-line bg-sunken">
                  <img src={p.image_url} alt={p.caption || 'Foto portofolio'} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(p)}
                    aria-label="Hapus foto"
                    className="absolute right-1.5 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <input
                  aria-label="Keterangan foto"
                  defaultValue={p.caption || ''}
                  maxLength={120}
                  placeholder="Keterangan (opsional)"
                  onBlur={(e) => setCaption(p, e.target.value.trim())}
                  className="min-h-9 rounded-[10px] border border-line bg-card px-2.5 text-[12.5px] text-ink placeholder:text-ink-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PORTFOLIO && (
          <>
            <input ref={fileRef} id="portfolio-upload" type="file" accept="image/*" multiple className="sr-only" onChange={addPhotos} />
            <Button variant="secondary" leftIcon={<ImagePlus size={16} />} isLoading={uploading} onClick={() => fileRef.current?.click()}>
              Tambah Foto
            </Button>
          </>
        )}
      </Card>

      <Sheet
        open={editOpen}
        onClose={() => { if (!saving) setEditOpen(false); }}
        dismissible={!saving}
        title="Ubah profil publik"
        description="Ditampilkan ke pelanggan di daftar teknisi Wira. Nomor HP Anda tidak pernah ditampilkan."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Batal</Button>
            <Button type="submit" form="tech-profile-form" isLoading={saving}>Simpan</Button>
          </>
        )}
      >
        <form id="tech-profile-form" onSubmit={save} className="flex flex-col gap-5">
          <Field label="Bio" htmlFor="tech-bio" hint={`${draft.bio.length}/500 · contoh: 8 tahun servis AC rumah dan villa, bersertifikat.`}>
            <Textarea id="tech-bio" rows={4} maxLength={500} value={draft.bio} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-ink">Wilayah layanan</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICE_AREAS.map((a) => (
                <Chip key={a} on={draft.service_areas.includes(a)} onClick={() => toggle('service_areas', a)}>{a}</Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-ink">Bahasa</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <Chip key={code} on={draft.languages.includes(code)} onClick={() => toggle('languages', code)}>{name}</Chip>
              ))}
            </div>
          </fieldset>
        </form>
      </Sheet>
    </>
  );
}
