import { Link, useLocation } from 'react-router-dom';
import { Card, IconTile, ListRow } from '../../components/ui';
import { Store, MapPin, Clock, CreditCard, UtensilsCrossed, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useMyMerchants from '../../hooks/useMyMerchants';
import ProfileShell from '../../components/shared/ProfileShell';

const MerchantProfilePage = () => {
  const { user } = useAuth();
  // Reused under both /merchant/* (Restoran) and /villa/*: links follow the
  // portal the partner is actually on.
  const { pathname } = useLocation();
  const basePath = pathname.startsWith('/villa') ? '/villa' : '/merchant';
  const isVilla = basePath === '/villa';
  // A villa host can run several properties (migration 0097); the profile
  // then speaks for the host, not for one villa.
  const { merchants } = useMyMerchants();
  const merchant = merchants[0] || null;
  const rated = merchants.filter((m) => m.rating);
  const avg = rated.length ? rated.reduce((s, m) => s + Number(m.rating), 0) / rated.length : null;

  const infoRows = [
    isVilla
      ? { icon: MapPin, title: 'Properti', text: merchants.length ? merchants.map((m) => m.name).join(', ') : 'Belum ada properti' }
      : { icon: MapPin, title: 'Alamat Resto', text: merchant?.address || 'Alamat belum diatur' },
    { icon: Clock, title: 'Jam Operasional', text: 'Dapat diatur oleh Admin' },
    { icon: CreditCard, title: 'Rekening Pencairan', text: 'Saldo WiraPay' },
  ];

  return (
    <ProfileShell
      image={merchant?.image}
      fallbackIcon={Store}
      name={isVilla ? (user?.name || 'Tuan Rumah') : (merchant?.name || 'Toko Anda')}
      subtitle={isVilla ? `Tuan rumah WiraVilla · ${merchants.length} properti` : 'Wira Food & Mart'}
      // merchants.rating has no review count next to it, so the stars show
      // whenever a rating is set (as before).
      rating={avg != null ? { avg, count: 3 } : { avg: null, count: 0 }}
      settingsTo={`${basePath}/settings`}
    >
      <Card padding="none" className="divide-y divide-line overflow-hidden">
        {infoRows.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3 px-4 py-3.5">
            <IconTile tone="neutral" size="sm"><Icon size={18} /></IconTile>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-[14px] font-semibold text-ink">{title}</p>
              <p className="break-words text-[13px] leading-relaxed text-ink-muted">{text}</p>
            </div>
          </div>
        ))}
      </Card>

      <Card padding="none">
        <ListRow
          as={Link}
          to={isVilla ? `${basePath}/listing` : `${basePath}/menu`}
          leading={<IconTile tone="brand" size="sm">{isVilla ? <Home size={18} /> : <UtensilsCrossed size={18} />}</IconTile>}
          title={isVilla ? 'Properti Saya' : 'Kelola Menu'}
          chevron
          className="min-h-14 px-4 py-3"
        />
      </Card>
    </ProfileShell>
  );
};
export default MerchantProfilePage;
