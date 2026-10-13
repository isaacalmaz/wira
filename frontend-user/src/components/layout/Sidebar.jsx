import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Activity, Wallet, User, Settings, LogOut, PanelLeftClose, PanelLeftOpen, Smartphone } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import WiraMark from '../brand/WiraMark';
import DownloadSheet from '../landing/DownloadSheet';
import { WALLET_ENABLED } from '../../config/wallet';
import { isNative } from '../../native/nativeShell';
import useMyProfile from '../../hooks/useMyProfile';

/**
 * Desktop sidebar. `collapsed` shrinks it to an icon strip (Layout keeps the
 * choice in localStorage); labels then live in title/aria-label.
 */
export default function Sidebar({ collapsed = false, onToggle }) {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [downloadOpen, setDownloadOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: Home, label: 'nav.home' },
    ...(WALLET_ENABLED ? [{ to: '/wallet', icon: Wallet, label: 'nav.wallet' }] : []),
    { to: '/activity', icon: Activity, label: 'nav.activity' },
  ];
  const linkCls = (active) => `flex items-center gap-3 rounded-control py-2.5 text-[14px] transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${active ? 'bg-brand-soft text-brand-ink font-bold' : 'text-ink-muted font-semibold hover:bg-sunken hover:text-ink'}`;
  const profile = useMyProfile();
  const name = profile?.name || user?.user_metadata?.name || t('nav.guest_name');
  const phone = profile?.phone || user?.user_metadata?.phone || user?.phone;
  const toggleLabel = collapsed ? t('nav.expand_sidebar') : t('nav.collapse_sidebar');
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="h-full bg-card border-r border-line flex flex-col overflow-hidden">
      <div className={collapsed ? 'px-3 pt-5 pb-4' : 'px-5 pt-6 pb-4'}>
        <div className={`mb-6 flex items-center gap-2 ${collapsed ? 'flex-col' : 'justify-between'}`}>
          <Link to="/" className="flex items-center gap-2.5" aria-label="Wira">
            <WiraMark size={collapsed ? 32 : 34} />
            {!collapsed && <span className="text-[24px] font-extrabold tracking-[-0.035em] leading-none text-brand-ink">wira</span>}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <ToggleIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <Link
          to="/profile"
          title={collapsed ? name : undefined}
          aria-label={collapsed ? name : undefined}
          className={`mb-6 flex items-center gap-3 rounded-card border border-line bg-ground transition-colors hover:border-line-strong ${collapsed ? 'justify-center p-2' : 'px-3 py-3'}`}
        >
          <div className="w-10 h-10 shrink-0 rounded-full bg-brand-soft text-brand-ink flex items-center justify-center">
            <User size={19} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-[14px] text-ink truncate">{name}</p>
              {phone && <p className="text-xs text-ink-muted truncate font-mono">{phone}</p>}
            </div>
          )}
        </Link>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={linkCls(active)}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? t(label) : undefined}
                aria-label={collapsed ? t(label) : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                {!collapsed && <span>{t(label)}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* The app (live tracking, order notifications); web only. */}
      {!isNative() && (
        <div className={collapsed ? 'mt-auto px-3 pb-2' : 'mt-auto px-5 pb-4'}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setDownloadOpen(true)}
              title={t('download.banner_title')}
              aria-label={t('download.banner_title')}
              className="flex w-full justify-center rounded-control py-2.5 text-brand-ink hover:bg-brand-soft"
            >
              <Smartphone size={19} aria-hidden="true" />
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-card border border-brand-line bg-brand-soft p-3.5 text-brand-ink">
              <span className="flex items-center gap-2 text-[13.5px] font-bold">
                <Smartphone size={17} className="shrink-0" aria-hidden="true" />
                {t('download.banner_title')}
              </span>
              <span className="text-[12px] leading-snug opacity-90">{t('download.banner_sub')}</span>
              <button
                type="button"
                onClick={() => setDownloadOpen(true)}
                className="mt-1 inline-flex min-h-9 items-center justify-center rounded-control bg-brand px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                {t('download.banner_cta')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`${isNative() ? 'mt-auto ' : ''}py-4 border-t border-line flex flex-col gap-1 ${collapsed ? 'px-3' : 'px-5'}`}>
        <Link
          to="/profile"
          className={linkCls(location.pathname.startsWith('/profile'))}
          title={collapsed ? t('nav.settings') : undefined}
          aria-label={collapsed ? t('nav.settings') : undefined}
        >
          <Settings size={19} aria-hidden="true" />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? t('nav.logout') : undefined}
          aria-label={collapsed ? t('nav.logout') : undefined}
          className={`w-full flex items-center gap-3 rounded-control py-2.5 text-[14px] font-semibold text-danger-ink hover:bg-danger-soft ${collapsed ? 'justify-center' : 'px-3'}`}
        >
          <LogOut size={19} aria-hidden="true" />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>
      </div>

      <DownloadSheet open={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </div>
  );
}
