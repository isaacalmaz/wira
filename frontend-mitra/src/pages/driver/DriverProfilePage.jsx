import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StarRating } from '../../components/shared/UIComponents';
import { Card, Badge, Button, IconTile, ListRow, SectionHeader, EmptyState } from '../../components/ui';
import { User, ShieldCheck, Car, Settings, Star, MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { fetchMyApplication } from '../../services/mitraApplicationService';
import { fetchCounterpartyProfiles } from '../../services/profileService';

const DriverProfilePage = () => {
  const { user, logout } = useAuth();
  const [vehicle, setVehicle] = useState('Memuat data...');
  const [plate, setPlate] = useState('');
  
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(5.0);

  useEffect(() => {
    const fetchRegData = async () => {
      const myReg = await fetchMyApplication(supabase, user.id, ['driver', 'courier']);
      if (myReg) {
        setVehicle(myReg.vehicle || 'Kendaraan Mitra');
        setPlate(myReg.plate || '');
      } else {
        setVehicle('Data kendaraan tidak ditemukan');
      }
    };
    
    const fetchReviews = async () => {
      // Reads from public.reviews (migrations/0039/0041) - the single
      // canonical review/rating table, written by both RidePage.jsx's
      // immediate post-trip prompt and Aktivitas/ReviewModal.jsx, so every
      // rating a customer gives actually shows up here. The older
      // public.driver_reviews table (migrations/0034) is deprecated and
      // was confirmed to hold 0 rows when this was switched over - nothing
      // to backfill.
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id, rating, review_text, created_at, user_id
        `)
        .eq('driver_id', user?.id)
        .order('created_at', { ascending: false });

      if (data && !error) {
        const profiles = await fetchCounterpartyProfiles(supabase, data.map((r) => r.user_id));
        data.forEach((r) => { r.customer = profiles[r.user_id] || null; });
        setReviews(data);
        if (data.length > 0) {
          const total = data.reduce((sum, r) => sum + r.rating, 0);
          setAvgRating((total / data.length).toFixed(1));
        }
      }
    };

    if (user) {
      fetchRegData();
      fetchReviews();
    }
  }, [user]);
  
  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex items-center gap-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sunken">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <User size={32} className="text-ink-muted" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="break-words text-[22px] font-extrabold capitalize leading-tight tracking-tight text-ink text-balance">{user?.name || 'Driver Wira'}</h1>
          <p className={`text-sm text-ink-muted ${user?.phone ? 'font-mono' : ''}`}>{user?.phone || 'Belum mengatur nomor HP'}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StarRating rating={parseFloat(avgRating)} />
            <span className="text-[13px] text-ink-muted"><span className="font-mono font-medium text-ink">{avgRating}</span> ({reviews.length} Ulasan)</span>
          </div>
        </div>
      </div>

      <Card padding="none">
        <ul className="divide-y divide-line">
          <li>
            <ListRow
              className="px-4 py-3.5"
              leading={<IconTile tone="brand" size="sm"><Car size={18} /></IconTile>}
              title={<span className="capitalize">{vehicle}</span>}
              subtitle={plate ? <span className="font-mono uppercase">{plate}</span> : 'Menunggu verifikasi admin'}
            />
          </li>
          <li>
            <ListRow
              className="px-4 py-3.5"
              leading={<IconTile tone="success" size="sm"><ShieldCheck size={18} /></IconTile>}
              title="Status Akun"
              trailing={<Badge tone="success" dot>Terverifikasi</Badge>}
            />
          </li>
          <li>
            <ListRow
              as={Link}
              to="/driver/settings"
              chevron
              className="min-h-14 px-4 py-3.5"
              leading={<IconTile tone="neutral" size="sm"><Settings size={18} /></IconTile>}
              title="Pengaturan Akun"
            />
          </li>
        </ul>
      </Card>

      {/* SECTION ULASAN PELANGGAN */}
      <section>
        <SectionHeader title="Ulasan Pelanggan" />
        {reviews.length === 0 ? (
          <EmptyState icon={<MessageSquare size={24} />} title="Belum ada ulasan dari pelanggan." />
        ) : (
          <div className="flex flex-col gap-3">
            {reviews.slice(0, 5).map((rev) => (
              <Card key={rev.id} padding="md" className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-[14px] font-semibold text-ink">{rev.customer?.name || 'Pelanggan'}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-ink" aria-label={`${rev.rating}/5`}>
                    <Star size={13} className="fill-current" aria-hidden="true" />
                    <span className="font-mono font-medium">{rev.rating}</span>
                  </span>
                </div>
                {rev.review_text && (
                  <p className="break-words rounded-control bg-sunken px-3 py-2.5 text-sm leading-relaxed text-ink">
                    "{rev.review_text}"
                  </p>
                )}
                <p className="text-[11.5px] text-ink-muted">
                  {new Date(rev.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </Card>
            ))}
            {reviews.length > 5 && (
              <p className="pt-1 text-center text-xs text-ink-muted">Menampilkan 5 ulasan terbaru</p>
            )}
          </div>
        )}
      </section>

      <Button variant="danger-soft" block leftIcon={<LogOut size={18} />} onClick={logout}>Keluar Akun</Button>
    </div>
  );
};
export default DriverProfilePage;
