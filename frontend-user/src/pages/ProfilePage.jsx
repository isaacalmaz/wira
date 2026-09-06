import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { User, Settings, LogOut, Heart, MapPin, Moon, Sun } from 'lucide-react';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const { toggleLang, lang } = useTranslation();

  return (
    <div className="space-y-6">
      <Card className="p-6 text-center">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full mx-auto flex items-center justify-center mb-4">
          <User size={48} />
        </div>
        <h2 className="text-xl font-bold dark:text-white">{user?.user_metadata?.name || user?.name || 'Pengguna Wira'}</h2>
        <p className="text-slate-500">{user?.user_metadata?.phone || user?.phone || '+62 812 3456 7890'}</p>
        <Button variant="outline" size="sm" className="mt-4">Edit Profil</Button>
      </Card>

      <div className="space-y-2">
        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <Heart className="text-red-500" />
            <span className="flex-1 font-medium dark:text-white">Tersimpan</span>
          </div>
          <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition">
            <MapPin className="text-blue-500" />
            <span className="flex-1 font-medium dark:text-white">Alamat Tersimpan</span>
          </div>
        </Card>

        <Card className="divide-y divide-slate-100 dark:divide-slate-700">
          <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition" onClick={toggleTheme}>
            <div className="flex items-center gap-4">
              {darkMode ? <Sun className="text-yellow-500" /> : <Moon className="text-slate-500" />}
              <span className="font-medium dark:text-white">Mode Gelap</span>
            </div>
            <div className="w-10 h-6 bg-slate-200 dark:bg-primary rounded-full relative">
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${darkMode ? 'right-1' : 'left-1'}`}></div>
            </div>
          </div>
          <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition" onClick={toggleLang}>
            <div className="flex items-center gap-4">
              <Settings className="text-slate-500" />
              <span className="font-medium dark:text-white">Bahasa</span>
            </div>
            <span className="text-sm bg-slate-100 dark:bg-slate-600 px-2 py-1 rounded">{lang === 'id' ? 'Indonesia' : 'English'}</span>
          </div>
        </Card>

        <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50" onClick={logout}>
          <LogOut size={18} className="mr-2" /> Keluar
        </Button>
      </div>
    </div>
  );
}
