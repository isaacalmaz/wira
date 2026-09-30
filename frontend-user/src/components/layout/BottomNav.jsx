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
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-line pb-safe">
      <div className="grid grid-cols-4 px-2 pt-1.5 pb-1.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-[10px] py-1.5 ${isActive ? 'text-brand-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <Icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
              <span className={`text-[11px] leading-none ${isActive ? 'font-bold' : 'font-semibold'}`}>{t(tab.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
