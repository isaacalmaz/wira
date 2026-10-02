import useOnlineStatus from '../../hooks/useOnlineStatus';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, ListOrdered, Wallet, User, Menu as MenuIcon, Building2, Car, Store, Wrench, LogOut } from 'lucide-react';
import WiraMark from '../brand/WiraMark';
import { cx } from '../ui';

// The underlying mitra_access value for the restaurant portal is still the
// literal string 'merchant' (kept as-is so existing accounts/routes don't
// break), but it's displayed everywhere else as "Restoran" now that Villa
// is a separate portal - this keeps the sidebar label consistent with that.
// 'courier' no longer exists as its own portal (see migrations/0033) - Driver
// now covers Ride/Kurir/Makanan together via Settings preferences.
const ROLE_DISPLAY_LABEL = { driver: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi' };
const ROLE_ICON = { driver: Car, merchant: Store, villa: Building2, technician: Wrench };

const MitraLayout = ({ children }) => {
  const { logout, mitraAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnlineStatus();

  // Ekstrak role aktif saat ini dari URL (contoh: /driver/orders -> driver).
  // Semua route di App.jsx berakar langsung di /driver, /merchant, /technician
  // (tidak pernah di bawah prefix /mitra), jadi tidak perlu cabang tambahan.
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeRole = pathParts[0] || mitraAccess?.[0] || 'driver';

  const getNavItems = () => {
    const base = [
      { to: `/${activeRole}`, icon: Home, label: 'Beranda' },
      { to: `/${activeRole}/orders`, icon: ListOrdered, label: activeRole === 'technician' ? 'Pekerjaan' : 'Pesanan' },
    ];

    if (activeRole === 'merchant') {
      base.push({ to: `/merchant/menu`, icon: MenuIcon, label: 'Menu' });
    }

    if (activeRole === 'villa') {
      base.push({ to: `/villa/listing`, icon: Building2, label: 'Properti' });
    }

    if (activeRole === 'technician') {
      base.push({ to: `/technician/schedule`, icon: MenuIcon, label: 'Jadwal' });
    }

    // Driver and Kurir deliberately get NO 4th nav tab here, unlike
    // merchant/villa/technician. Each of those three has a real standalone
    // management surface behind its extra tab (a product catalog, a listing
    // editor, a work calendar) that doesn't fit inside Beranda/Pesanan.
    // Driver/Kurir have no equivalent - there's no separate "thing to
    // manage" beyond the incoming-job screen (Beranda) and the job list
    // (Pesanan) itself, so Beranda/Pesanan/Pendapatan/Profil is already the
    // complete set. Forcing a 4th tab here just to match tab-count would add
    // a dead-end screen, not real parity - so this asymmetry stays, on
    // purpose, after reviewing it.

    base.push(
      { to: `/${activeRole}/earnings`, icon: Wallet, label: 'Pendapatan' },
      { to: `/${activeRole}/profile`, icon: User, label: 'Profil' }
    );

    return base;
  };

  const navItems = getNavItems();
  const ActiveRoleIcon = ROLE_ICON[activeRole];
  const roleLabel = ROLE_DISPLAY_LABEL[activeRole] || activeRole;

  // Display only: the driver home draws its own full-height map
  // (h-[calc(100vh-4rem)]), so it gets no mobile top bar and no extra
  // bottom padding, keeping its height maths as it was.
  const isFullScreenPage = location.pathname === '/driver';

  const sideLinkCls = ({ isActive }) => cx(
    'flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-[14px] transition-colors',
    isActive ? 'bg-brand-soft text-brand-ink font-bold' : 'text-ink-muted font-semibold hover:bg-sunken hover:text-ink',
  );

  const wordmark = (size) => (
    <span className="flex items-baseline gap-1.5 leading-none" aria-hidden="true">
      <span className={cx('font-extrabold tracking-[-0.035em] text-brand-ink', size === 'lg' ? 'text-[24px]' : 'text-[22px]')}>wira</span>
      <span className={cx('font-medium tracking-[-0.02em] text-ink-muted', size === 'lg' ? 'text-[17px]' : 'text-[16px]')}>mitra</span>
    </span>
  );

  return (
    <div className="flex min-h-[100dvh] bg-ground">
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-warning px-4 py-2 text-center text-[13px] font-semibold text-white">
          Anda sedang offline. Lokasi dan status pesanan dikirim lagi begitu sinyal kembali.
        </div>
      )}
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col h-screen sticky top-0 bg-card border-r border-line">
        <div className="px-5 pt-6 pb-4 flex flex-col gap-6 min-h-0 flex-1">
          <NavLink to={`/${activeRole}`} className="flex items-center gap-2.5" aria-label="Wira Mitra">
            <WiraMark size={34} />
            {wordmark('lg')}
          </NavLink>

          {/* Portal aktif */}
          <div className="flex items-center gap-3 rounded-card border border-line bg-ground px-3 py-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-brand-line bg-brand-soft text-brand-ink">
              {ActiveRoleIcon ? <ActiveRoleIcon size={19} /> : <User size={19} />}
            </span>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Mitra</span>
              <span className="font-bold text-[14px] text-ink truncate">{roleLabel}</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === `/${activeRole}`}
                className={sideLinkCls}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="px-5 py-4 border-t border-line">
          <button
            type="button"
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full min-h-11 flex items-center gap-3 rounded-control px-3 py-2.5 text-[14px] font-semibold text-danger-ink transition-colors hover:bg-danger-soft"
          >
            <LogOut size={19} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (Mobile) */}
        {!isFullScreenPage && (
          <header className="md:hidden sticky top-0 z-30 pt-safe bg-ground/90 backdrop-blur border-b border-line">
            <div className="h-14 flex items-center justify-between gap-3 px-4">
              <NavLink to={`/${activeRole}`} className="flex items-center gap-2.5 min-w-0" aria-label="Wira Mitra">
                <WiraMark size={30} />
                {wordmark('md')}
              </NavLink>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand-ink">
                {ActiveRoleIcon && <ActiveRoleIcon size={14} aria-hidden="true" />}
                {roleLabel}
              </span>
            </div>
          </header>
        )}

        {/* Main Content */}
        <main
          className={cx(
            'flex-1 w-full max-w-5xl mx-auto px-4 pt-4 md:px-8 md:pt-8 md:pb-8',
            isFullScreenPage ? 'pb-4' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-line pb-safe">
        <div
          className="grid px-2 py-1.5"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${activeRole}`}
              className={({ isActive }) => cx(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] py-1.5',
                isActive ? 'text-brand-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                  <span className={cx('max-w-full truncate px-0.5 text-[11px] leading-none', isActive ? 'font-bold' : 'font-semibold')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default MitraLayout;
