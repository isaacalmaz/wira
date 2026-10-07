import { useAuth } from '../../context/AuthContext';
import ProfileShell from '../../components/shared/ProfileShell';
import ReviewsSection from '../../components/shared/ReviewsSection';
import usePartnerRating from '../../hooks/usePartnerRating';

export default function NannyProfilePage() {
  const { user } = useAuth();
  const rating = usePartnerRating(user?.id);
  return (
    <ProfileShell
      image={user?.avatar_url}
      name={user?.name || 'Pengasuh Wira'}
      subtitle={<span>Pengasuh WiraAsuh{user?.phone ? <> · <span className="font-mono">{user.phone}</span></> : null}</span>}
      rating={rating}
      settingsTo="/nanny/settings"
    >
      {user && <ReviewsSection userId={user.id} />}
    </ProfileShell>
  );
}
