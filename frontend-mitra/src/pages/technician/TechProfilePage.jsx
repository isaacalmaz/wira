import { useState, useEffect } from 'react';
import { Card, Badge } from '../../components/ui';
import { Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { fetchMyApplication } from '../../services/mitraApplicationService';
import { fetchMyTechnicianProfile } from '../../services/technicianService';
import useSkills from '../../hooks/useSkills';
import usePartnerRating from '../../hooks/usePartnerRating';
import ProfileShell from '../../components/shared/ProfileShell';
import ReviewsSection from '../../components/shared/ReviewsSection';
import TechPublicProfile from '../../components/shared/TechPublicProfile';

const TechProfilePage = () => {
  const { user } = useAuth();
  const { nameOf } = useSkills();
  const rating = usePartnerRating(user?.id);
  const [skills, setSkills] = useState(null);
  const [experience, setExperience] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchMyTechnicianProfile(supabase, user.id)
      .then((p) => setSkills(p?.skills || []))
      .catch(() => setSkills([]));
    fetchMyApplication(supabase, user.id, ['technician'])
      .then((app) => setExperience(app?.experience ? `${app.experience} Tahun` : ''))
      .catch(() => {});
  }, [user]);

  return (
    <ProfileShell
      image={user?.avatar_url}
      name={user?.name || 'Teknisi Wira'}
      subtitle={<span className={user?.phone ? 'font-mono' : ''}>{user?.phone || 'Belum mengatur nomor HP'}</span>}
      rating={rating}
      settingsTo="/technician/settings"
    >
      <Card padding="md" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
          <Wrench size={17} className="text-ink-muted" aria-hidden="true" /> Keahlian
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {skills === null ? (
            <span className="text-[13px] text-ink-muted">Memuat...</span>
          ) : skills.length > 0 ? (
            skills.map((code) => <Badge key={code} tone="brand">{nameOf(code)}</Badge>)
          ) : (
            <span className="text-[13px] text-ink-muted">Belum diatur admin</span>
          )}
        </div>
        {experience && <p className="text-[13px] font-semibold text-ink-muted">Pengalaman: <span className="font-mono">{experience}</span></p>}
        <p className="text-[12.5px] leading-relaxed text-ink-muted">Ingin menambah keahlian? Hubungi admin Wira lewat menu Bantuan.</p>
      </Card>

      {user && <ReviewsSection userId={user.id} />}

      {user && <TechPublicProfile userId={user.id} />}
    </ProfileShell>
  );
};
export default TechProfilePage;
