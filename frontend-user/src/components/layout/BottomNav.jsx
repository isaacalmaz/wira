import { Home, Activity, Wallet, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n';

export default function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();

  const tabs = [
    { path: '/', icon: Home, label: 'nav.home' },
    { path: '/activity', icon: Activity, label: 'nav.activity' },
    { path: '/wallet', icon: Wallet, label: 'nav.wallet' },
    { path: '/profile', icon: User, label: 'nav.profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-around items-center z-50">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = location.pathname === tab.path;
        return (
          <Link key={tab.path} to={tab.path} className={`flex flex-col items-center gap-1 p-2 ${isActive ? 'text-primary dark:text-primary-light' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon size={24} />
            <span className="text-[10px]">{t(tab.label)}</span>
          </Link>
        );
      })}
    </div>
  );
}
