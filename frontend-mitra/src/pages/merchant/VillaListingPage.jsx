import { useState, useEffect } from 'react';
import { Home, Save, MapPin, Image as ImageIcon } from 'lucide-react';
import { Card, Button, Field, Input, Textarea, Money, PageHeader, EmptyState, Spinner } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

/**
 * Edit form for a WiraVilla merchant's own listing. Unlike WiraFood (a
 * repeating list of `products` rows), a villa merchant has exactly one
 * `merchants` row to edit directly - there's no separate items/room-types
 * table (frontend-user/src/pages/VillaPage.jsx reads purely from
 * `merchants`). RLS for this UPDATE already exists (merchants_update_owner_or_admin,
 * migrations/0024) - this page was the missing piece, not the database.
 */
export default function VillaListingPage() {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [pricePerNight, setPricePerNight] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');

  useEffect(() => {
    const fetchListing = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (data) {
        setMerchantId(data.id);
        setName(data.name || '');
        setAddress(data.address || '');
        setPricePerNight(data.price_per_night ?? '');
        setDescription(data.description || '');
        setImage(data.image || '');
      }
      setLoading(false);
    };
    fetchListing();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!merchantId) return;
    if (!name.trim()) {
      toast.error('Nama villa wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const { error, data } = await supabase
        .from('merchants')
        .update({
          name: name.trim(),
          address: address.trim(),
          price_per_night: pricePerNight === '' ? null : Number(pricePerNight),
          description: description.trim(),
          image: image.trim() || null,
        })
        .eq('id', merchantId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau villa tidak ditemukan.');
      toast.success('Listing villa berhasil diperbarui');
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-ink-muted" role="status">
        <Spinner size={24} className="text-brand-ink" />
        <p className="text-sm">Memuat data villa...</p>
      </div>
    );
  }

  if (!merchantId) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={<Home size={24} />} title="Villa Anda belum terdaftar di database. Hubungi admin." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-20">
      <PageHeader
        title="Kelola Listing Villa"
        subtitle="Perbarui informasi villa yang tampil untuk tamu di WiraVilla"
        className="mb-0"
      />

      {/* Property card: how the listing reads with the values in the form below */}
      <Card padding="none" className="overflow-hidden">
        {image ? (
          <img src={image} alt="Pratinjau villa" className="h-44 w-full bg-sunken object-cover sm:h-56" />
        ) : (
          <div className="flex h-44 w-full items-center justify-center bg-sunken text-ink-muted sm:h-56">
            <ImageIcon size={32} aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 p-4">
          <h2 className="break-words text-[16px] font-bold leading-snug text-ink">{name || 'Nama Villa'}</h2>
          {address && (
            <p className="flex items-start gap-1.5 text-[13px] text-ink-muted">
              <MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{address}</span>
            </p>
          )}
          <p className="flex items-baseline gap-1 pt-1 text-[13px] text-ink-muted">
            {pricePerNight !== '' && pricePerNight !== null ? (
              <Money value={pricePerNight} className="text-[18px] font-medium text-ink" />
            ) : (
              <span className="font-mono text-[18px] font-medium text-ink-muted">Rp –</span>
            )}
            <span>/ malam</span>
          </p>
        </div>
      </Card>

      <Card>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Nama Villa" htmlFor="villa-name" required>
            <Input
              id="villa-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Villa Senggigi Sunset"
              required
            />
          </Field>

          <Field label="Alamat" htmlFor="villa-address">
            <Input
              id="villa-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Contoh: Jl. Raya Senggigi, Lombok Barat"
            />
          </Field>

          <Field label="Harga per Malam (Rp)" htmlFor="villa-price">
            <Input
              id="villa-price"
              type="number"
              inputMode="numeric"
              min="0"
              value={pricePerNight}
              onChange={(e) => setPricePerNight(e.target.value)}
              className="font-mono"
              placeholder="Contoh: 850000"
            />
          </Field>

          <Field label="Deskripsi" htmlFor="villa-description">
            <Textarea
              id="villa-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Ceritakan keunggulan villa Anda..."
            />
          </Field>

          <Field label="URL Foto Villa" htmlFor="villa-image">
            <Input
              id="villa-image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" block isLoading={saving} leftIcon={<Save size={18} />}>
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
