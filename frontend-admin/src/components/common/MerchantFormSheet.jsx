import { useEffect, useState } from 'react';
import { Home, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { Button, Field, Input, Notice, Sheet, Textarea } from '../ui';

const EMPTY = { name: '', category: '', address: '', image: '', price: '', description: '', ownerEmail: '' };

/**
 * Admin form to add a restaurant (kind="food") or a villa (kind="villa")
 * directly, without a mitra application. merchants INSERT is admin-only
 * (0026 merchants_insert_admin). An optional owner email links the listing
 * to an existing account and grants the matching mitra portal, the same
 * grant MerchantsPage makes when it approves an application.
 */
export default function MerchantFormSheet({ open, kind = 'food', onClose, onSaved }) {
  const isVilla = kind === 'villa';
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const address = form.address.trim();
    const price = Number(form.price);
    if (!name || !address) {
      toast.error('Nama dan alamat wajib diisi.');
      return;
    }
    if (isVilla && (!Number.isFinite(price) || price <= 0)) {
      toast.error('Isi harga per malam yang valid.');
      return;
    }

    setSaving(true);
    try {
      let ownerId = null;
      const email = form.ownerEmail.trim().toLowerCase();
      if (email) {
        const { data: owner, error: ownerErr } = await supabase
          .from('users')
          .select('id, name, mitra_access')
          .ilike('email', email)
          .maybeSingle();
        if (ownerErr) throw ownerErr;
        if (!owner) throw new Error(`Tidak ada akun dengan email ${email}. Kosongkan jika belum ada pemilik.`);
        ownerId = owner.id;

        const grant = isVilla ? 'villa' : 'merchant';
        const access = Array.isArray(owner.mitra_access) ? owner.mitra_access : [];
        if (!access.includes(grant)) {
          const { data: updated, error: grantErr } = await supabase
            .from('users')
            .update({ mitra_access: [...access, grant] })
            .eq('id', owner.id)
            .select('id');
          if (grantErr) throw grantErr;
          if (!updated || updated.length === 0) throw new Error('Akses pemilik ditolak oleh RLS.');
        }
      }

      const row = {
        name,
        address,
        service_type: isVilla ? 'villa' : 'food',
        category: isVilla ? null : (form.category.trim() || null),
        image: form.image.trim() || null,
        owner_id: ownerId,
        is_open: true,
        ...(isVilla ? { price_per_night: price, description: form.description.trim() || null } : {}),
      };
      const { data, error } = await supabase.from('merchants').insert(row).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Penambahan ditolak oleh RLS.');

      toast.success(isVilla ? `Vila ${name} ditambahkan.` : `Merchant ${name} ditambahkan.`);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const formId = isVilla ? 'villa-form' : 'merchant-form';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      icon={isVilla ? <Home size={21} /> : <Store size={21} />}
      title={isVilla ? 'Tambah Vila' : 'Tambah Merchant Restoran'}
      description={isVilla
        ? 'Properti langsung tampil di WiraVilla setelah disimpan.'
        : 'Restoran langsung tampil di WiraFood setelah disimpan. Menu ditambahkan oleh pemilik lewat Wira Mitra.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form={formId} isLoading={saving}>Simpan</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        <Field label={isVilla ? 'Nama vila' : 'Nama restoran'} htmlFor={`${formId}-name`} required>
          <Input id={`${formId}-name`} value={form.name} onChange={set('name')} maxLength={80} required />
        </Field>
        {!isVilla && (
          <Field label="Kategori" htmlFor={`${formId}-category`} hint="Contoh: Ayam, Seafood, Minuman">
            <Input id={`${formId}-category`} value={form.category} onChange={set('category')} maxLength={40} />
          </Field>
        )}
        <Field label="Alamat" htmlFor={`${formId}-address`} required>
          <Textarea id={`${formId}-address`} value={form.address} onChange={set('address')} rows={2} required />
        </Field>
        {isVilla && (
          <>
            <Field label="Harga per malam (Rp)" htmlFor={`${formId}-price`} required>
              <Input
                id={`${formId}-price`}
                type="number"
                inputMode="numeric"
                min={1}
                value={form.price}
                onChange={set('price')}
                className="font-mono"
                required
              />
            </Field>
            <Field label="Deskripsi" htmlFor={`${formId}-desc`}>
              <Textarea id={`${formId}-desc`} value={form.description} onChange={set('description')} rows={3} />
            </Field>
          </>
        )}
        <Field label="URL foto" htmlFor={`${formId}-image`} hint="Opsional. Tautan gambar (https://…).">
          <Input id={`${formId}-image`} type="url" value={form.image} onChange={set('image')} placeholder="https://" />
        </Field>
        <Field
          label="Email pemilik (opsional)"
          htmlFor={`${formId}-owner`}
          hint={isVilla
            ? 'Akun ini akan mendapat akses portal Villa di Wira Mitra.'
            : 'Akun ini akan mendapat akses portal Restoran di Wira Mitra dan bisa mengelola menu.'}
        >
          <Input id={`${formId}-owner`} type="email" value={form.ownerEmail} onChange={set('ownerEmail')} autoComplete="off" />
        </Field>
        {!form.ownerEmail.trim() && (
          <Notice tone="info">Tanpa pemilik, listing ini hanya bisa dikelola dari panel admin.</Notice>
        )}
      </form>
    </Sheet>
  );
}
