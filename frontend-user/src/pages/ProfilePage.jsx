import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { toast } from "react-hot-toast";
import { User, Settings, MessageSquare, LogOut, Heart, MapPin, Moon, Sun, ChevronRight } from 'lucide-react';
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

  return (
    <div className="space-y-6 pb-20">
      <Card className="p-6 text-center">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center mb-4 overflow-hidden border-2 border-primary">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User size={48} />
          )}
        </div>
        <h2 className="text-xl font-bold dark:text-white">
          {loading ? t('profile.loading_name') : displayName}
        </h2>
        {(loading || displayPhone) && (
          <p className="text-slate-500">{loading ? '...' : displayPhone}</p>
        )}
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-4" 
          onClick={() => navigate('/profile/edit')}
        >
          {t('profile.edit')}
        </Button>
      </Card>

      <div className="space-y-2">
        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition" onClick={() => toast(t('profile.feature_coming_soon'))}>
            <Heart className="text-red-500" />
            <span className="flex-1 font-medium dark:text-white">{t('profile.saved_items')}</span>
            <ChevronRight size={20} className="text-slate-400" />
          </div>
          <div 
            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            onClick={() => navigate('/profile/addresses')}
          >
            <MapPin className="text-blue-500" />
            <span className="flex-1 font-medium dark:text-white">{t('profile.saved_addresses')}</span>
            <ChevronRight size={20} className="text-slate-400" />
          </div>
        </Card>

        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition" onClick={toggleTheme}>
            <div className="flex items-center gap-4">
              {darkMode ? <Sun className="text-yellow-500" /> : <Moon className="text-slate-500" />}
              <span className="font-medium dark:text-white">{t('profile.dark_mode')}</span>
            </div>
            <div className="w-10 h-6 bg-slate-200 dark:bg-primary rounded-full relative">
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${darkMode ? 'right-1' : 'left-1'}`}></div>
            </div>
          </div>
          <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition" onClick={toggleLang}>
            <div className="flex items-center gap-4">
              <Settings className="text-slate-500" />
              <span className="font-medium dark:text-white">{t('profile.language')}</span>
            </div>
            <span className="text-sm bg-slate-100 dark:bg-slate-600 px-2 py-1 rounded">{lang === 'id' ? t('profile.language_id') : t('profile.language_en')}</span>
          </div>
        </Card>

        {/* Pusat Bantuan & Legal */}
        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          <Link to="/support" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
            <div className="flex items-center gap-4">
              <MessageSquare className="text-slate-500" />
              <span className="font-medium dark:text-white">{t('profile.support')}</span>
            </div>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">{t('profile.support_badge')}</span>
          </Link>
          <Link to="/contact" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
            <span className="font-medium dark:text-white">{t('profile.contact')}</span>
          </Link>
          <Link to="/terms" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
            <span className="font-medium dark:text-white">{t('profile.terms')}</span>
          </Link>
          <Link to="/refund" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
            <span className="font-medium dark:text-white">{t('profile.refund')}</span>
          </Link>
        </Card>

        <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-slate-800" onClick={logout}>
          <LogOut size={18} className="mr-2" /> {t('profile.logout')}
        </Button>
      </div>
    </div>
  );
}
