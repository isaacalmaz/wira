import { useState, useEffect } from 'react';
import { Card, Badge, IconTile, ListRow } from '../../components/ui';
import { ShieldCheck, Car } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { fetchMyApplication } from '../../services/mitraApplicationService';
import ProfileShell from '../../components/shared/ProfileShell';
import ReviewsSection from '../../components/shared/ReviewsSection';
import usePartnerRating from '../../hooks/usePartnerRating';

const DriverProfilePage = () => {
  const { user } = useAuth();
  const rating = usePartnerRating(user?.id);
  const [vehicle, setVehicle] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchMyApplication(supabase, user.id, ['driver', 'courier'])
      .then((app) => setVehicle(app ? { name: app.vehicle || 'Kendaraan Mitra', plate: app.plate || '' } : { name: 'Data kendaraan tidak ditemukan', plate: '' }))
      .catch(() => setVehicle({ name: 'Data kendaraan tidak ditemukan', plate: '' }));
  }, [user]);

  return (
    <ProfileShell
      image={user?.avatar_url}
      name={user?.name || 'Driver Wira'}
      subtitle={<span className={user?.phone ? 'font-mono' : ''}>{user?.phone || 'Belum mengatur nomor HP'}</span>}
      rating={rating}
      settingsTo="/driver/settings"
    >
      <Card padding="none">
        <ul className="divide-y divide-line">
          <li>
            <ListRow
              className="px-4 py-3.5"
              leading={<IconTile tone="brand" size="sm"><Car size={18} /></IconTile>}
              title={<span className="capitalize">{vehicle ? vehicle.name : 'Memuat...'}</span>}
              subtitle={vehicle?.plate ? <span className="font-mono uppercase">{vehicle.plate}</span> : 'Menunggu verifikasi admin'}
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
        </ul>
      </Card>

      {user && <ReviewsSection userId={user.id} />}
    </ProfileShell>
  );
};
export default DriverProfilePage;
