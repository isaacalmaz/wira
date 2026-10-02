import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, BedDouble, Users, Image as ImageIcon, Pencil, Building2 } from 'lucide-react';
import { Card, Button, Badge, Money, PageHeader, EmptyState, Spinner, Notice, cx } from '../../components/ui';
import { supabase } from '../../config/supabase';
import { toast } from 'react-hot-toast';
import useMyMerchants from '../../hooks/useMyMerchants';
import { listingState } from './villaShared';

/**
 * "Properti Saya": every villa this host runs (migration 0097). New
 * properties wait for an admin before guests can book them; a live one
 * can be paused on its own without touching the others.
 */
export default function VillaListingPage() {
  const navigate = useNavigate();
  const { merchants, loading, reload } = useMyMerchants();
  const [busy, setBusy] = useState(null);

  const toggleOpen = async (m) => {
    setBusy(m.id);
    try {
      const { data, error } = await supabase
        .from('merchants')
        .update({ is_open: m.is_open === false })
        .eq('id', m.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak.');
      toast.success(m.is_open === false ? `${m.name} kembali menerima pemesanan` : `${m.name} dijeda`);
      reload();
    } catch (err) {
      toast.error('Gagal mengubah: ' + err.message);
    } finally {
      setBusy(null);
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

  const addButton = (
    <Button variant="primary" leftIcon={<Plus size={18} />} onClick={() => navigate('/villa/listing/new')}>
      Tambah Properti
    </Button>
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-20">
      <PageHeader
        title="Properti Saya"
        subtitle={merchants.length ? `${merchants.length} properti di WiraVilla` : 'Kelola villa yang Anda sewakan di WiraVilla'}
        className="mb-0"
        actions={merchants.length ? addButton : null}
      />

      {merchants.length === 0 ? (
        <EmptyState
          icon={<Building2 size={24} />}
          title="Belum ada properti"
          description="Tambahkan villa pertama Anda. Admin meninjau sebelum tamu bisa memesan."
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {merchants.map((m) => {
            const state = listingState(m);
            const cover = m.photos?.[0] || m.image;
            const live = m.listing_status === 'approved';
            return (
              <Card key={m.id} padding="none" className="overflow-hidden">
                <div className="relative">
                  {cover ? (
                    <img src={cover} alt="" className={cx('h-40 w-full bg-sunken object-cover', !live || m.is_open === false ? 'opacity-70' : '')} />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-sunken text-ink-muted">
                      <ImageIcon size={28} aria-hidden="true" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3"><Badge tone={state.tone} dot>{state.label}</Badge></span>
                  {m.photos?.length > 1 && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white">
                      {m.photos.length} foto
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-[16px] font-bold leading-snug text-ink">{m.name}</h2>
                    <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-muted">
                      {m.price_per_night ? <Money value={m.price_per_night} className="text-[15px] font-medium text-ink" /> : <span className="font-mono">Rp –</span>}
                      <span>/malam</span>
                    </p>
                  </div>
                  {m.address && (
                    <p className="flex items-start gap-1.5 text-[13px] text-ink-muted">
                      <MapPin size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
                      <span className="min-w-0 break-words">{m.address}</span>
                    </p>
                  )}
                  {(m.bedrooms || m.max_guests) && (
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                      {m.bedrooms ? <span className="inline-flex items-center gap-1.5"><BedDouble size={14} aria-hidden="true" />{m.bedrooms} kamar</span> : null}
                      {m.max_guests ? <span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden="true" />maks. {m.max_guests} tamu</span> : null}
                    </p>
                  )}
                  {m.listing_status === 'rejected' && m.review_note && (
                    <Notice tone="danger" title="Catatan admin">{m.review_note}</Notice>
                  )}
                  {m.listing_status === 'pending' && (
                    <p className="text-[12px] text-ink-muted">Admin biasanya meninjau dalam 1x24 jam. Anda akan mendapat notifikasi.</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" className="flex-1" leftIcon={<Pencil size={16} />} onClick={() => navigate(`/villa/listing/${m.id}`)}>
                      {m.listing_status === 'rejected' ? 'Perbaiki' : 'Ubah'}
                    </Button>
                    {live && (
                      <Button
                        variant={m.is_open === false ? 'primary' : 'secondary'}
                        className="flex-1"
                        isLoading={busy === m.id}
                        onClick={() => toggleOpen(m)}
                      >
                        {m.is_open === false ? 'Buka Lagi' : 'Jeda Pemesanan'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
