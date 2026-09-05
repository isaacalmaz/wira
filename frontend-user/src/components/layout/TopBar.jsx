import { Bell, Moon, Sun } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { APP_CONFIG } from '../../config/app';

export default function TopBar() {
  const { lang, toggleLang } = useTranslation();
  const { darkMode, toggleTheme } = useTheme();

  return (
    <header className="h-16 flex items-center justify-between px-4 bg-white dark:bg-slate-800 shadow-sm z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">W</div>
        <h1 className="text-xl font-bold text-primary dark:text-primary-light">{APP_CONFIG.name}</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button onClick={toggleTheme} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button onClick={toggleLang} className="px-2 py-1 text-sm bg-slate-100 dark:bg-slate-700 rounded">
          {lang === 'id' ? 'ID' : 'EN'}
        </button>
        <button className="p-2 text-slate-500 dark:text-slate-400 relative">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
      </div>
    </header>
  );
}
