import useOnlineStatus from '../../hooks/useOnlineStatus';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, ListOrdered, Wallet, User, Menu as MenuIcon, Building2, LogOut, Bell, CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import WiraMark from '../brand/WiraMark';
import { cx } from '../ui';
import { RoleSwitcherSheet, RoleSwitcherSidebarButton, RoleSwitcherHeaderBadge } from './RoleSwitcher';

const playSensoryAlert = () => {
  try {
    if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
      navigator.vibrate([120, 80, 120]);
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Autoplay restrictions or audio context errors handled safely
  }
};

const MitraLayout = ({ children }) => {
  const { logout, mitraAccess, user } = useAuth();
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
      { to: `/${activeRole}/orders`, icon: ListOrdered, label: activeRole === 'technician' ? 'Pekerjaan' : activeRole === 'nanny' ? 'Sesi' : 'Pesanan' },
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

    // WiraRide bookings for later (migrations/0132) are taken ahead of time
    // from their own list, so drivers get a Jadwal tab like technicians.
    if (activeRole === 'driver') {
      base.push({ to: `/driver/schedule`, icon: CalendarClock, label: 'Jadwal' });
    }

    base.push(
      { to: `/${activeRole}/earnings`, icon: Wallet, label: 'Pendapatan' },
      { to: `/${activeRole}/profile`, icon: User, label: 'Profil' }
    );

    return base;
  };

  const navItems = getNavItems();

  // In-dashboard role switcher state and listener
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  useEffect(() => {
    const handleOpen = () => setIsSwitcherOpen(true);
    window.addEventListener('wira:open-role-switcher', handleOpen);
    return () => window.removeEventListener('wira:open-role-switcher', handleOpen);
  }, []);

  // Unread notifications dot on the bell (inbox: /<role>/notifications).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    const count = async () => {
      const { count: n } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('is_read', false);
      if (alive) setUnread(n || 0);
    };
    count();
    const channel = supabase.channel(`mitra-notifs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        count();
        const n = payload.new;
        if (n) {
          const text = n.description ? `${n.title}: ${n.description}` : n.title;
          toast(text, {
            duration: 6000,
            icon: '🔔',
          });
          playSensoryAlert();
        }
      })
      .subscribe();
    const onRead = () => setUnread(0);
    window.addEventListener('wira:notifications-read', onRead);
    const t = setInterval(count, 60000);
    return () => { alive = false; supabase.removeChannel(channel); window.removeEventListener('wira:notifications-read', onRead); clearInterval(t); };
  }, [user?.id]);

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

          {/* Portal aktif / Role Switcher */}
          <RoleSwitcherSidebarButton
            currentRole={activeRole}
            roles={mitraAccess}
            onClick={() => setIsSwitcherOpen(true)}
          />

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
              <div className="flex shrink-0 items-center gap-1.5">
                <RoleSwitcherHeaderBadge
                  currentRole={activeRole}
                  roles={mitraAccess}
                  onClick={() => setIsSwitcherOpen(true)}
                />
                <NavLink
                  to={`/${activeRole}/notifications`}
                  aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
                  className="relative inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
                >
                  <Bell size={20} />
                  {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-ground bg-danger" aria-hidden="true" />}
                </NavLink>
              </div>
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

      <RoleSwitcherSheet
        open={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        currentRole={activeRole}
        roles={mitraAccess}
      />
    </div>
  );
};

export default MitraLayout;
