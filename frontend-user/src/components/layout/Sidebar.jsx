import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Activity, Wallet, User, Settings, LogOut } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import WiraMark from '../brand/WiraMark';
import { WALLET_ENABLED } from '../../config/wallet';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: Home, label: 'nav.home' },
    ...(WALLET_ENABLED ? [{ to: '/wallet', icon: Wallet, label: 'nav.wallet' }] : []),
    { to: '/activity', icon: Activity, label: 'nav.activity' },
  ];
  const linkCls = (active) => `flex items-center gap-3 rounded-control px-3 py-2.5 text-[14px] transition-colors ${active ? 'bg-brand-soft text-brand-ink font-bold' : 'text-ink-muted font-semibold hover:bg-sunken hover:text-ink'}`;
  const name = user?.user_metadata?.name || user?.name || t('nav.guest_name');
  const phone = user?.user_metadata?.phone || user?.phone;

  return (
    <div className="h-full bg-card border-r border-line flex flex-col">
      <div className="px-5 pt-6 pb-4">
        <Link to="/" className="flex items-center gap-2.5 mb-7" aria-label="Wira">
          <WiraMark size={34} />
          <span className="text-[24px] font-extrabold tracking-[-0.035em] leading-none text-brand-ink">wira</span>
        </Link>

        <div className="flex items-center gap-3 mb-6 rounded-card border border-line bg-ground px-3 py-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-brand-soft text-brand-ink flex items-center justify-center">
            <User size={19} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[14px] text-ink truncate">{name}</p>
            {phone && <p className="text-xs text-ink-muted truncate font-mono">{phone}</p>}
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={linkCls(active)} aria-current={active ? 'page' : undefined}>
                <Icon size={19} />
                <span>{t(label)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto px-5 py-4 border-t border-line flex flex-col gap-1">
        <Link to="/profile" className={linkCls(location.pathname.startsWith('/profile'))}>
          <Settings size={19} />
          <span>{t('nav.settings')}</span>
        </Link>
        <button type="button" onClick={handleLogout} className="w-full flex items-center gap-3 rounded-control px-3 py-2.5 text-[14px] font-semibold text-danger-ink hover:bg-danger-soft">
          <LogOut size={19} />
          <span>{t('nav.logout')}</span>
        </button>
      </div>
    </div>
  );
}
