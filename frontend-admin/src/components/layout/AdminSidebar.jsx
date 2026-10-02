import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  ToggleLeft,
  Users,
  ShoppingBag,
  Car,
  Store,
  Wrench,
  Home,
  Wallet,
  Ticket,
  MessageSquare,
  Settings,
  Tag,
  LogOut,
  Star,
  ClipboardList,
  Percent,
  History,
  Megaphone,
  MapPinned,
} from 'lucide-react';
import { fetchPendingApplications, subscribeToApplications } from '../../services/mitraApplicationService';
import { supabase } from '../../config/supabase';
import WiraMark from '../brand/WiraMark';
import { Badge, cx } from '../ui';
import { CORE_ADMIN_ROLES, ADMIN_ROLES, CS_ADMIN_ROLES, FINANCE_ADMIN_ROLES, FEATURE_FLAG_ROLES } from '../../config/roles';

// Daftar menu sesuai dengan instruksi. Names, paths and role sets are the
// source of truth for navigation; `group` only decides the visual section.
// Each item's roles are the same set its route in App.jsx allows.
export const MENU_ITEMS = [
  { name: 'Dasbor', icon: LayoutDashboard, path: '/dashboard', roles: ADMIN_ROLES, group: 'ringkasan' },
  { name: 'Pesanan', icon: ShoppingBag, path: '/orders', roles: CS_ADMIN_ROLES, group: 'operasional' },
  { name: 'Proyek', icon: ClipboardList, path: '/projects', roles: CORE_ADMIN_ROLES, group: 'operasional' },
  { name: 'Pengguna', icon: Users, path: '/users', roles: ADMIN_ROLES, group: 'operasional' },
  { name: 'Driver', icon: Car, path: '/drivers', roles: CORE_ADMIN_ROLES, countKey: 'driver', group: 'mitra' },
  { name: 'Restoran', icon: Store, path: '/merchants', roles: CORE_ADMIN_ROLES, countKey: 'merchant', group: 'mitra' },
  { name: 'Villa', icon: Home, path: '/villas', roles: CORE_ADMIN_ROLES, countKey: 'villa', group: 'mitra' },
  { name: 'Teknisi', icon: Wrench, path: '/technicians', roles: CORE_ADMIN_ROLES, countKey: 'technician', group: 'mitra' },
  { name: 'Ulasan', icon: Star, path: '/reviews', roles: CORE_ADMIN_ROLES, group: 'mitra' },
  { name: 'Keuangan', icon: Wallet, path: '/finance', roles: FINANCE_ADMIN_ROLES, group: 'bisnis' },
  { name: 'Harga', icon: Tag, path: '/pricing', roles: CORE_ADMIN_ROLES, group: 'bisnis' },
  { name: 'Komisi', icon: Percent, path: '/commission', roles: CORE_ADMIN_ROLES, group: 'bisnis' },
  { name: 'Promo', icon: Ticket, path: '/promos', roles: CORE_ADMIN_ROLES, group: 'bisnis' },
  { name: 'Pusat Bantuan', icon: MessageSquare, path: '/support', roles: CS_ADMIN_ROLES, group: 'layanan' },
  { name: 'Pengumuman', icon: Megaphone, path: '/announcements', roles: CS_ADMIN_ROLES, group: 'layanan' },
  { name: 'Fitur Layanan', icon: ToggleLeft, path: '/features', roles: FEATURE_FLAG_ROLES, group: 'sistem' },
  { name: 'Wilayah Operasi', icon: MapPinned, path: '/zones', roles: FEATURE_FLAG_ROLES, group: 'sistem' },
  { name: 'Log Aktivitas', icon: History, path: '/audit', roles: CORE_ADMIN_ROLES, group: 'sistem' },
  { name: 'Pengaturan', icon: Settings, path: '/settings', roles: CORE_ADMIN_ROLES, group: 'sistem' },
];

const GROUPS = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'operasional', label: 'Operasional' },
  { key: 'mitra', label: 'Mitra' },
  { key: 'bisnis', label: 'Bisnis & Keuangan' },
  { key: 'layanan', label: 'Layanan & Komunikasi' },
  { key: 'sistem', label: 'Sistem' },
];

const initialsOf = (name = '') =>
  name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'A';

const AdminSidebar = ({ isCollapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [pendingCounts, setPendingCounts] = useState({ driver: 0, merchant: 0, villa: 0, technician: 0 });

  const fetchPendingCounts = async () => {
    try {
      const list = await fetchPendingApplications(null, 'id, role');

      // Driver (Ride) and Kurir (Send) are two distinct registration roles
      // now (see migrations/0031) but still share the /drivers admin page
      // and its sidebar badge - matching only 'driver' here would repeat
      // the exact bug just fixed for Villa registrations (commit 1476fc0):
      // a pending Kurir application would exist but never
      // be counted, so the sidebar badge could sit at 0 while a real
      // registration silently waited.
      const driverCount = list.filter((m) => m.role === 'driver' || m.role === 'courier').length;
      const merchantCount = list.filter((m) => m.role === 'merchant').length;
      const techCount = list.filter((m) => m.role === 'technician').length;
      // Villas: new host registrations plus properties hosts added that
      // wait for review (migration 0097).
      const { count: listings } = await supabase
        .from('merchants')
        .select('id', { count: 'exact', head: true })
        .eq('listing_status', 'pending');
      const villaCount = list.filter((m) => m.role === 'villa').length + (listings || 0);

      setPendingCounts({ driver: driverCount, merchant: merchantCount, villa: villaCount, technician: techCount });
    } catch { /* best-effort; ignore */ }
  };

  useEffect(() => {
    fetchPendingCounts();

    return subscribeToApplications('realtime-sidebar-counts', fetchPendingCounts);
  }, []);

  // Filter menu berdasarkan role pengguna
  const filteredMenu = MENU_ITEMS.filter(item => item.roles.includes(user?.role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderItem = (item) => {
    const Icon = item.icon;
    const isNestedInAdmin = location.pathname.startsWith('/admin');
    const fullPath = isNestedInAdmin ? `/admin${item.path}` : item.path;
    const isActive = isNestedInAdmin
      ? location.pathname === fullPath || (item.path !== '/' && location.pathname.startsWith(fullPath))
      : location.pathname.startsWith(item.path);
    const badgeCount = item.countKey ? pendingCounts[item.countKey] : 0;

    return (
      <Link
        key={item.name}
        to={fullPath}
        aria-current={isActive ? 'page' : undefined}
        className={cx(
          'relative flex min-h-10 items-center gap-3 rounded-[10px] text-[13.5px] transition-colors',
          isCollapsed ? 'justify-center px-0' : 'px-3',
          isActive
            ? 'bg-brand-soft text-brand-ink font-bold'
            : 'text-ink-muted font-semibold hover:bg-sunken hover:text-ink',
        )}
        title={isCollapsed ? `${item.name}${badgeCount > 0 ? ` (${badgeCount} menunggu)` : ''}` : undefined}
      >
        <span className="relative inline-flex shrink-0">
          <Icon size={19} />
          {isCollapsed && badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-warning" aria-hidden="true" />
          )}
        </span>
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {badgeCount > 0 && (
              <Badge tone="warning" className="font-mono !px-2">{badgeCount}</Badge>
            )}
          </>
        )}
      </Link>
    );
  };

  const userName = user?.name || 'Administrator';

  return (
    <aside
      className={cx(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-line bg-card transition-[width] duration-300',
        isCollapsed ? 'w-20' : 'w-64',
      )}
    >
      {/* Logo lockup */}
      <div className={cx('flex h-16 shrink-0 items-center border-b border-line', isCollapsed ? 'justify-center' : 'px-5')}>
        <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Wira Admin">
          <WiraMark size={32} className="shrink-0" />
          {!isCollapsed && (
            <span className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[22px] font-extrabold tracking-[-0.035em] text-ink">wira</span>
              <span className="text-[15px] font-medium tracking-tight text-ink-muted">admin</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigasi */}
      <nav className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {GROUPS
          .map((group) => ({ ...group, items: filteredMenu.filter((item) => item.group === group.key) }))
          .filter((group) => group.items.length > 0)
          .map((group, index) => {
          const { items } = group;
          return (
            <div key={group.key} className="flex flex-col gap-0.5">
              {isCollapsed ? (
                index > 0 && <span className="mx-3 mb-1 h-px bg-line" aria-hidden="true" />
              ) : (
                <span className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted/80">
                  {group.label}
                </span>
              )}
              {items.map(renderItem)}
            </div>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className={cx('shrink-0 border-t border-line p-3', isCollapsed && 'flex flex-col items-center gap-2')}>
        {isCollapsed ? (
          <>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-ink"
              title={`${userName} · ${user?.role || ''}`}
            >
              {initialsOf(userName)}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              title="Keluar Sistem"
              aria-label="Keluar Sistem"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-danger-ink hover:bg-danger-soft"
            >
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-control px-2 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-ink">
              {initialsOf(userName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-tight text-ink">{userName}</p>
              <p className="truncate text-xs text-ink-muted">{user?.role || 'Super Admin'}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Keluar Sistem"
              aria-label="Keluar Sistem"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger-ink"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AdminSidebar;
