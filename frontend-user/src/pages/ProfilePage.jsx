import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from "react-hot-toast";
import { User, Languages, MessageSquare, LogOut, Heart, MapPin, Moon, Sun, Headphones, FileText, RotateCcw, Pencil, ClipboardList, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, IconTile, ListRow, cx } from '../components/ui';
import { supabase } from '../config/supabase';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const { t, toggleLang, lang } = useTranslation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        setProfile(data);
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const displayName = profile?.name || user?.user_metadata?.name || t('nav.guest_name');
  const displayPhone = profile?.phone || user?.user_metadata?.phone || '';
  const avatarUrl = profile?.avatar_url ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl : null;

  const rowCls = 'min-h-14 px-4 py-3';
  const lead = (Icon) => (
    <IconTile size="sm" tone="neutral">
      <Icon size={18} aria-hidden="true" />
    </IconTile>
  );

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Profile header */}
      <Card padding="lg">
        <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-line bg-brand-soft text-brand-ink">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <User size={30} aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="text-[18px] font-extrabold leading-snug tracking-tight text-ink truncate">
            {loading ? t('profile.loading_name') : displayName}
          </h1>
          {(loading || displayPhone) && (
            <p className="font-mono text-[13px] text-ink-muted break-all">{loading ? '...' : displayPhone}</p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 shrink-0"
          leftIcon={<Pencil size={15} aria-hidden="true" />}
          onClick={() => navigate('/profile/edit')}
        >
          {t('profile.edit')}
        </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          <ListRow
            className={rowCls}
            leading={lead(Heart)}
            title={t('profile.saved_items')}
            chevron
            onClick={() => toast(t('profile.feature_coming_soon'))}
          />
          <ListRow
            className={rowCls}
            leading={lead(MapPin)}
            title={t('profile.saved_addresses')}
            chevron
            onClick={() => navigate('/profile/addresses')}
          />
          <ListRow
            className={rowCls}
            leading={lead(ClipboardList)}
            title={t('profile.my_projects')}
            chevron
            onClick={() => navigate('/projects')}
          />
        </Card>

        <Card padding="none" className="divide-y divide-line overflow-hidden">
          <ListRow
            className={rowCls}
            leading={lead(darkMode ? Sun : Moon)}
            title={t('profile.dark_mode')}
            aria-pressed={darkMode}
            onClick={toggleTheme}
            trailing={(
              <span className={cx('relative inline-block h-7 w-12 rounded-full align-middle transition-colors duration-200', darkMode ? 'bg-brand' : 'bg-line-strong')} aria-hidden="true">
                <span className={cx('absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform duration-200', darkMode ? 'translate-x-5' : 'translate-x-0')} />
              </span>
            )}
          />
          <ListRow
            className={rowCls}
            leading={lead(Languages)}
            title={t('profile.language')}
            onClick={toggleLang}
            trailing={<Badge tone="neutral">{lang === 'id' ? t('profile.language_id') : t('profile.language_en')}</Badge>}
          />
        </Card>

        {/* Pusat Bantuan & Legal */}
        <Card padding="none" className="divide-y divide-line overflow-hidden">
          <ListRow
            as={Link}
            to="/support"
            className={rowCls}
            leading={lead(MessageSquare)}
            title={t('profile.support')}
            trailing={<Badge tone="brand">{t('profile.support_badge')}</Badge>}
            chevron
          />
          <ListRow as={Link} to="/contact" className={rowCls} leading={lead(Headphones)} title={t('profile.contact')} chevron />
          <ListRow as={Link} to="/terms" className={rowCls} leading={lead(FileText)} title={t('profile.terms')} chevron />
          <ListRow as={Link} to="/refund" className={rowCls} leading={lead(RotateCcw)} title={t('profile.refund')} chevron />
          <ListRow as={Link} to="/privacy" className={rowCls} leading={lead(ShieldCheck)} title={t('profile.privacy')} chevron />
        </Card>

        <Button variant="danger-soft" block leftIcon={<LogOut size={18} aria-hidden="true" />} onClick={logout}>
          {t('profile.logout')}
        </Button>
      </div>
    </div>
  );
}
