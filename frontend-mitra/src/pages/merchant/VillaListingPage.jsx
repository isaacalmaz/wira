import React, { useState, useEffect } from 'react';
import { Home, Save } from 'lucide-react';
import { Card, Button } from '../../components/shared/UIComponents';
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
    return <div className="text-center py-12 text-slate-500">Memuat data villa...</div>;
  }

  if (!merchantId) {
    return (
      <div className="text-center py-12 text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
        Villa Anda belum terdaftar di database. Hubungi admin.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Home size={22} className="text-primary" /> Kelola Listing Villa
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Perbarui informasi villa yang tampil untuk tamu di WiraVilla
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Nama Villa</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Contoh: Villa Senggigi Sunset"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Alamat</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Contoh: Jl. Raya Senggigi, Lombok Barat"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Harga per Malam (Rp)</label>
            <input
              type="number"
              min="0"
              value={pricePerNight}
              onChange={(e) => setPricePerNight(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm font-bold dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Contoh: 850000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Deskripsi</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              className="w-full p-2.5 border rounded-xl text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="Ceritakan keunggulan villa Anda..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">URL Foto Villa</label>
            <input
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm dark:bg-slate-700 dark:text-white dark:border-slate-600 focus:ring-2 focus:ring-primary focus:outline-none"
              placeholder="https://..."
            />
            {image && (
              <img src={image} alt="Pratinjau villa" className="mt-2 w-full h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
            )}
          </div>

          <Button type="submit" variant="primary" className="w-full py-2.5 flex items-center justify-center gap-2" disabled={saving}>
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
