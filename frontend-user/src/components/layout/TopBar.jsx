import { Link } from 'react-router-dom';
import { Bell, Moon, Sun } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { APP_CONFIG } from '../../config/app';
import { useNotification } from '../../context/NotificationContext';
import WiraMark from '../brand/WiraMark';

export default function TopBar() {
  const { t, lang, toggleLang } = useTranslation();
  const { darkMode, toggleTheme } = useTheme();
  const { unreadCount } = useNotification();

  return (
    <header className="h-16 flex items-center justify-between px-4 bg-white dark:bg-slate-800 shadow-sm z-10">
      <div className="flex items-center gap-2">
        <WiraMark size={32} />
        <h1 className="text-xl font-bold text-primary dark:text-primary-light">{APP_CONFIG.name}</h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleTheme}
          title={darkMode ? t('topbar.toggle_theme_light') : t('topbar.toggle_theme_dark')}
          aria-label={darkMode ? t('topbar.toggle_theme_light') : t('topbar.toggle_theme_dark')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        {/* Shows the language currently in use; the tooltip says what tapping it switches to. */}
        <button
          onClick={toggleLang}
          title={t('topbar.switch_language')}
          aria-label={t('topbar.switch_language')}
          className="px-2 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded"
        >
          {lang === 'id' ? 'ID' : 'EN'}
        </button>
        <Link
          to="/notifications"
          title={t('topbar.open_notifications')}
          aria-label={t('topbar.open_notifications')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full relative transition"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-slate-800 rounded-full"></span>
          )}
        </Link>
      </div>
    </header>
  );
}
