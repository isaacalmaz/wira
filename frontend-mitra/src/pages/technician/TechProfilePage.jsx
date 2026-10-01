import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StarRating } from '../../components/shared/UIComponents';
import { Card, Badge, Button, EmptyState, IconTile, ListRow } from '../../components/ui';
import { User, Wrench, Image as ImageIcon, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { fetchMyApplication } from '../../services/mitraApplicationService';
import { fetchMyTechnicianProfile } from '../../services/technicianService';
import useSkills from '../../hooks/useSkills';
import ReviewsSection from '../../components/shared/ReviewsSection';

const TechProfilePage = () => {
  const { user, logout } = useAuth();
  const { nameOf } = useSkills();
  const [skills, setSkills] = useState(null);
  const [experience, setExperience] = useState('');
  const [rating, setRating] = useState({ avg: null, count: 0 });

  useEffect(() => {
    if (!user) return;
    fetchMyTechnicianProfile(supabase, user.id)
      .then((p) => setSkills(p?.skills || []))
      .catch(() => setSkills([]));
    fetchMyApplication(supabase, user.id, ['technician'])
      .then((app) => setExperience(app?.experience ? `${app.experience} Tahun` : ''))
      .catch(() => {});
    // Visible reviews only (hidden ones no longer count, migrations/0091).
    supabase.rpc('partner_rating', { p_user_id: user.id })
      .then(({ data }) => {
        const row = data?.[0];
        setRating({ avg: row?.rating_avg != null ? Number(row.rating_avg) : null, count: row?.rating_count || 0 });
      });
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
          <h1 className="break-words text-[22px] font-extrabold capitalize leading-tight tracking-tight text-ink text-balance">{user?.name || 'Teknisi Wira'}</h1>
          <p className={`text-sm text-ink-muted ${user?.phone ? 'font-mono' : ''}`}>{user?.phone || 'Belum mengatur nomor HP'}</p>
          {rating.count >= 3 ? (
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(rating.avg)} />
              <span className="font-mono text-[13px] font-medium text-ink">{rating.avg.toFixed(1)}</span>
              <span className="text-[12.5px] text-ink-muted">({rating.count} ulasan)</span>
            </div>
          ) : (
            <Badge tone="brand" className="self-start">
              {rating.count === 0 ? 'Belum ada ulasan' : `Baru di Wira · ${rating.count} ulasan`}
            </Badge>
          )}
        </div>
      </div>

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

      <Card padding="none">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            <ImageIcon size={17} className="text-ink-muted" aria-hidden="true" /> Portfolio Hasil Kerja
          </h2>
          <EmptyState
            icon={<ImageIcon size={24} />}
            title="Belum ada foto portofolio"
            description="Fitur unggah foto hasil kerja akan segera hadir."
          />
        </div>
        <ListRow
          as={Link}
          to="/technician/settings"
          chevron
          className="min-h-14 px-4 py-3.5"
          leading={<IconTile tone="neutral" size="sm"><Settings size={18} /></IconTile>}
          title="Pengaturan Akun"
        />
      </Card>

      <Button variant="danger-soft" block leftIcon={<LogOut size={18} />} onClick={logout}>Keluar Akun</Button>
    </div>
  );
};
export default TechProfilePage;
