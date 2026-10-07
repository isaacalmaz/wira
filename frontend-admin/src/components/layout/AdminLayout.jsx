import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import AdminSidebar, { MENU_ITEMS } from './AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Bell, Sun, Moon, LogOut, Check, ExternalLink, Clock, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Car, Package, Store, Home, Wrench,
  Menu, LayoutDashboard, ShoppingBag, Wallet, MessageSquare,
} from 'lucide-react';
import { Badge, IconTile, cx } from '../ui';
import { supabase } from '../../config/supabase';
import { subscribeToApplications } from '../../services/mitraApplicationService';
import { KINDS } from '../common/AttentionBoard';

// One brand tile per notification; the icon (not a colour) tells the role apart.
const NOTIF_ICONS = { driver: Car, courier: Package, merchant: Store, villa: Home, technician: Wrench };

const AdminLayout = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Below lg (1024px) the sidebar is a drawer, closed after every navigation.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Hanya Notifikasi Asli dari Supabase
  const [notifications, setNotifications] = useState([]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );
  };

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The bell lists every queue waiting for this admin - the same
  // admin_attention() source as the dashboard board (migrations/0116),
  // refreshed every minute and when a partner application arrives.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc('admin_attention');
      if (cancelled || !data) return;
      const fmtSince = (ts) => {
        if (!ts) return '';
        const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
        return mins < 60 ? `${mins} mnt` : mins < 2880 ? `${Math.round(mins / 60)} jam` : `${Math.round(mins / 1440)} hari`;
      };
      const items = KINDS
        .filter((k) => k.roles.includes(user?.role))
        .map((k) => ({ k, d: data[k.key] || {} }))
        .filter(({ d }) => Number(d.count) > 0)
        .sort((x, y) => y.k.level - x.k.level)
        .map(({ k, d }) => ({
          id: k.key,
          title: `${k.label}: ${Number(d.count).toLocaleString('id-ID')}`,
          desc: k.hint || (k.money && Number(d.amount) > 0 ? `Total Rp ${Math.round(Number(d.amount)).toLocaleString('id-ID')}` : 'Buka untuk menindaklanjuti.'),
          time: d.oldest ? `terlama ${fmtSince(d.oldest)}` : '',
          unread: true,
          link: k.link || '/dashboard',
          icon: k.icon,
        }));
      setNotifications((prev) => items.map((n) => {
        const old = prev.find((p) => p.id === n.id);
        return old && old.title === n.title ? { ...n, unread: old.unread } : n;
      }));
    };
    load();
    const t = setInterval(load, 60000);
    const unsubscribe = subscribeToApplications('realtime-admin-notifs', load);
    return () => { cancelled = true; clearInterval(t); unsubscribe?.(); };
  }, [user?.role]);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // Phone bottom bar: the pages admins open most, filtered by role.
  const bottomNav = useMemo(() => {
    const wanted = [
      { path: '/dashboard', label: 'Dasbor', icon: LayoutDashboard },
      { path: '/orders', label: 'Pesanan', icon: ShoppingBag },
      { path: '/finance', label: 'Keuangan', icon: Wallet },
      { path: '/support', label: 'Bantuan', icon: MessageSquare },
    ];
    return wanted.filter((w) => MENU_ITEMS.find((m) => m.path === w.path)?.roles.includes(user?.role));
  }, [user?.role]);

  const pageLabel = useMemo(() => {
    const path = location.pathname.replace(/^\/admin/, '');
    if (path.startsWith('/partners')) return 'Profil mitra';
    const match = MENU_ITEMS.find((item) => path.startsWith(item.path));
    return match?.name || 'Dasbor';
  }, [location.pathname]);

  const userName = user?.name || 'Administrator';
  const initials = userName.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'A';

  const iconBtn = 'relative inline-flex h-10 w-10 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-sunken hover:text-ink';

  return (
    <div className="min-h-screen bg-ground text-ink transition-colors duration-200">
      {/* Sidebar */}
      <AdminSidebar
        isCollapsed={isSidebarCollapsed && !mobileNavOpen}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div className={`min-w-0 transition-[padding] duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>

        {/* Top Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-line bg-ground/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className={`${iconBtn} -ml-2 lg:hidden`}
              aria-label="Buka menu"
            >
              <Menu size={21} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
              className={`${iconBtn} -ml-2 hidden lg:inline-flex`}
              aria-label={isSidebarCollapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
              title={isSidebarCollapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <span className="truncate text-[15px] font-bold text-ink sm:hidden">{pageLabel}</span>
            <div className="hidden min-w-0 items-center gap-2 text-[13.5px] sm:flex">
              <span className="font-medium text-ink-muted">Wira Admin Portal</span>
              <ChevronRight size={14} className="shrink-0 text-ink-muted/70" aria-hidden="true" />
              <span className="truncate font-bold text-ink">{pageLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">

            <a
              href="https://wira-pied.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="mr-1 hidden min-h-10 items-center gap-1.5 rounded-control px-3 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-brand-ink sm:inline-flex"
            >
              <ExternalLink size={15} /> Buka App User
            </a>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={iconBtn}
              title="Toggle Dark Mode"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className={cx(iconBtn, showNotifications && 'bg-sunken text-ink')}
                aria-label="Notifikasi"
                aria-expanded={showNotifications}
              >
                <Bell size={19} />
                {unreadCount > 0 && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-ground bg-danger" aria-hidden="true" />
                )}
              </button>

              {/* Dropdown Panel */}
              {showNotifications && (
                <div className="fixed inset-x-3 top-16 mt-1 overflow-hidden rounded-card border border-line bg-card shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h3 className="flex items-center gap-2 text-[14px] font-bold text-ink">
                      Notifikasi <Badge tone={unreadCount > 0 ? 'brand' : 'neutral'}><span className="font-mono">{unreadCount}</span> Baru</Badge>
                    </h3>
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[12.5px] font-semibold text-brand-ink hover:underline"
                    >
                      Tandai sudah dibaca
                    </button>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                        <IconTile tone="neutral" size="md"><Bell size={19} /></IconTile>
                        <p className="text-[13px] text-ink-muted">Tidak ada yang menunggu. Semua beres.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-line">
                        {notifications.map((notif) => {
                          const TypeIcon = notif.icon || NOTIF_ICONS[notif.type] || Bell;
                          return (
                            <div
                              key={notif.id}
                              className={cx('relative transition-colors hover:bg-sunken/60', notif.unread && 'bg-brand-soft/50')}
                              onClick={() => markAsRead(notif.id)}
                            >
                              <Link to={notif.link} onClick={() => setShowNotifications(false)} className="flex gap-3 px-4 py-3">
                                <IconTile tone={notif.unread ? 'brand' : 'neutral'} size="sm" className="mt-0.5">
                                  {notif.type === 'system' ? <Check size={16} /> : <TypeIcon size={16} />}
                                </IconTile>
                                <div className="min-w-0 flex-1">
                                  <h4 className={cx('text-[13.5px] leading-snug', notif.unread ? 'font-bold text-ink' : 'font-semibold text-ink-muted')}>
                                    {notif.title}
                                  </h4>
                                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{notif.desc}</p>
                                  <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-ink-muted">
                                    <Clock size={11} /> {notif.time}
                                  </p>
                                </div>
                                {notif.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-line bg-sunken/50 px-4 py-2.5 text-center">
                    <Link to="/dashboard" onClick={() => setShowNotifications(false)} className="text-[12.5px] font-semibold text-ink-muted hover:text-ink">
                      Buka Dasbor
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="ml-1 flex items-center gap-3 border-l border-line pl-3 sm:ml-2 sm:pl-4">
              <div className="hidden text-right md:block">
                <p className="text-[13px] font-bold leading-tight text-ink">{userName}</p>
                <p className="text-[11.5px] leading-tight text-ink-muted">{user?.role || 'Super Admin'}</p>
              </div>
              <div className="group relative">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-[12px] font-bold text-brand-ink"
                  aria-label="Profil"
                >
                  {initials}
                </button>

                {/* Profile Dropdown */}
                <div className="invisible absolute right-0 top-full w-56 pt-2 opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="overflow-hidden rounded-card border border-line bg-card shadow-pop">
                    <div className="border-b border-line px-4 py-3">
                      <p className="text-[13.5px] font-bold text-ink">{userName}</p>
                      <p className="truncate text-xs text-ink-muted">{user?.email || 'admin@wira.app'}</p>
                    </div>
                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          navigate('/login');
                        }}
                        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-danger-ink transition-colors hover:bg-danger-soft"
                      >
                        <LogOut size={16} /> Keluar Sistem
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-6">
          <Outlet />
        </main>

        {/* Phone bottom navigation */}
        <nav
          aria-label="Navigasi utama"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          {bottomNav.map(({ path, label, icon: Icon }) => {
            const active = location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-brand-ink' : 'text-ink-muted')}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-muted"
          >
            <span className="relative">
              <Menu size={20} aria-hidden="true" />
              {notifications.length > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-danger" aria-hidden="true" />}
            </span>
            Menu
          </button>
        </nav>
      </div>
    </div>
  );
};

export default AdminLayout;
