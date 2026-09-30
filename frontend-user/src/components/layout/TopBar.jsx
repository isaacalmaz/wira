import { Link } from 'react-router-dom';
import { Bell, Moon, Sun } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { useNotification } from '../../context/NotificationContext';
import WiraMark from '../brand/WiraMark';

const iconBtn = 'relative inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] border border-line bg-card px-2 text-ink transition-colors hover:bg-sunken';

export default function TopBar() {
  const { t, lang, toggleLang } = useTranslation();
  const { darkMode, toggleTheme } = useTheme();
  const { unreadCount } = useNotification();

  return (
    <header className="sticky top-0 z-30 pt-safe bg-ground/90 backdrop-blur border-b border-line">
      <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 md:invisible" aria-label="Wira">
          <WiraMark size={30} />
          <span className="text-[22px] font-extrabold tracking-[-0.035em] leading-none text-brand-ink">wira</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            title={darkMode ? t('topbar.toggle_theme_light') : t('topbar.toggle_theme_dark')}
            aria-label={darkMode ? t('topbar.toggle_theme_light') : t('topbar.toggle_theme_dark')}
            className={iconBtn}
          >
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {/* Shows the language in use; the tooltip says what tapping it does. */}
          <button
            type="button"
            onClick={toggleLang}
            title={t('topbar.switch_language')}
            aria-label={t('topbar.switch_language')}
            className={`${iconBtn} text-xs font-bold tracking-wide`}
          >
            {lang === 'id' ? 'ID' : 'EN'}
          </button>
          <Link
            to="/notifications"
            title={t('topbar.open_notifications')}
            aria-label={t('topbar.open_notifications')}
            className={iconBtn}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-ground" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
