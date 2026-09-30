import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StarRating } from '../../components/shared/UIComponents';
import { Card, Button, IconTile, ListRow } from '../../components/ui';
import { Store, MapPin, Clock, CreditCard, Settings, UtensilsCrossed, Home, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';

const MerchantProfilePage = () => {
  const { user, logout } = useAuth();
  const [merchant, setMerchant] = useState(null);
  // This component is reused under both /merchant/* (Restoran) and /villa/*
  // portals - link targets must follow whichever root the caller is
  // actually on, not be hardcoded to one.
  const { pathname } = useLocation();
  const basePath = pathname.startsWith('/villa') ? '/villa' : '/merchant';

  useEffect(() => {
    const fetchMerchant = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('owner_id', user.id)
        .single();
      if (data) setMerchant(data);
    };
    fetchMerchant();
  }, [user]);

  const isVilla = merchant?.service_type === 'villa' || merchant?.service_type === 'WiraVilla';

  const infoRows = [
    { icon: MapPin, title: isVilla ? 'Alamat Villa' : 'Alamat Resto', text: merchant?.address || 'Alamat belum diatur' },
    { icon: Clock, title: 'Jam Operasional', text: 'Dapat diatur oleh Admin' },
    { icon: CreditCard, title: 'Rekening Pencairan', text: 'Saldo WiraPay' },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-20">
      <Card className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft text-brand-ink">
          {merchant?.image ? (
            <img src={merchant.image} alt="Resto" className="h-full w-full object-cover" />
          ) : (
            <Store size={32} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="break-words text-[22px] font-extrabold capitalize leading-tight tracking-tight text-ink text-balance">{merchant?.name || 'Toko Anda'}</h1>
          <p className="text-[13px] capitalize text-ink-muted">{merchant?.service_type || 'Wira Food & Mart'}</p>
          <div className="flex items-center gap-2">
            <StarRating rating={merchant?.rating || 5.0} />
            <span className="font-mono text-[13px] font-medium text-ink">{merchant?.rating || 5.0}</span>
          </div>
        </div>
      </Card>

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

      <Card padding="none" className="divide-y divide-line overflow-hidden">
        <ListRow
          as={Link}
          to={isVilla ? `${basePath}/listing` : `${basePath}/menu`}
          leading={<IconTile tone="brand" size="sm">{isVilla ? <Home size={18} /> : <UtensilsCrossed size={18} />}</IconTile>}
          title={isVilla ? 'Kelola Listing Villa' : 'Kelola Menu'}
          chevron
          className="min-h-14 px-4 py-3"
        />
        <ListRow
          as={Link}
          to={`${basePath}/settings`}
          leading={<IconTile tone="brand" size="sm"><Settings size={18} /></IconTile>}
          title="Pengaturan Akun"
          chevron
          className="min-h-14 px-4 py-3"
        />
      </Card>

      <Button variant="danger-soft" size="lg" block leftIcon={<LogOut size={18} />} onClick={logout}>Keluar Akun</Button>
    </div>
  );
};
export default MerchantProfilePage;
