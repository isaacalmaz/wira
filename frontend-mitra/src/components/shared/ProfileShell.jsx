import { Link } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';
import { StarRating } from './UIComponents';
import { Badge, Button, Card, IconTile, ListRow } from '../ui';
import { useAuth } from '../../context/AuthContext';

/** Stars once there are 3 reviews; before that a plain "new" badge. */
export function RatingLine({ avg, count }) {
  if (count >= 3 && avg != null) {
    return (
      <div className="flex items-center gap-2">
        <StarRating rating={Math.round(avg)} />
        <span className="font-mono text-[13px] font-medium text-ink">{avg.toFixed(1)}</span>
        <span className="text-[12.5px] text-ink-muted">({count} ulasan)</span>
      </div>
    );
  }
  return (
    <Badge tone="brand" className="self-start">
      {count === 0 ? 'Belum ada ulasan' : `Baru di Wira · ${count} ulasan`}
    </Badge>
  );
}

/**
 * The profile page frame shared by every partner role: header (photo, name,
 * subtitle, rating), role-specific body, account settings link and logout.
 */
export default function ProfileShell({ image, fallbackIcon: Fallback = User, name, subtitle, rating, settingsTo, children }) {
  const { logout } = useAuth();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-20">
      <div className="flex items-center gap-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sunken">
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Fallback size={32} className="text-ink-muted" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="break-words text-[22px] font-extrabold capitalize leading-tight tracking-tight text-ink text-balance">{name}</h1>
          {subtitle && <div className="text-sm text-ink-muted">{subtitle}</div>}
          {rating && <RatingLine {...rating} />}
        </div>
      </div>

      {children}

      <Card padding="none">
        <ListRow
          as={Link}
          to={settingsTo}
          chevron
          className="min-h-14 px-4 py-3.5"
          leading={<IconTile tone="neutral" size="sm"><Settings size={18} /></IconTile>}
          title="Pengaturan Akun"
        />
      </Card>

      <Button variant="danger-soft" block leftIcon={<LogOut size={18} />} onClick={logout}>Keluar Akun</Button>
    </div>
  );
}
