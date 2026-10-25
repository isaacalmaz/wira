import useOnlineStatus from '../../hooks/useOnlineStatus';
import { lazy, Suspense, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Spinner from '../ui/Spinner';
import useMyProfile from '../../hooks/useMyProfile';
import AIAssistantFAB from '../assistant/AIAssistantFAB';
import AIAssistantSheet from '../assistant/AIAssistantSheet';

const LandingPage = lazy(() => import('../../pages/LandingPage'));

// Pages anyone may read without signing in (linked from the landing page,
// the Play Store listing and emails).
const PUBLIC_PATHS = ['/terms', '/refund', '/contact'];

export default function Layout() {
  const location = useLocation();
  const isFullScreenPage = ['/ride'].includes(location.pathname);
  const { isAuthenticated, loading } = useAuth();
  const online = useOnlineStatus();
  const { t } = useTranslation();
  const profile = useMyProfile();
  // Desktop sidebar: full or an icon strip, remembered per browser.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const toggleSidebar = () => setCollapsed((c) => {
    try { localStorage.setItem('sidebarCollapsed', c ? '0' : '1'); } catch { /* private mode */ }
    return !c;
  });
  // Home uses the screen width on desktop (two columns); other pages stay a reading column.
  const isHome = location.pathname === '/';
  const [isAIOpen, setIsAIOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ground text-brand-ink">
        <Spinner size={28} />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Web visitors get the front page; the Android app goes straight to sign-in.
    if (location.pathname === '/' && !Capacitor.isNativePlatform()) {
      return (
        <Suspense fallback={<div className="h-screen bg-laut-900" />}>
          <LandingPage />
        </Suspense>
      );
    }
    if (PUBLIC_PATHS.includes(location.pathname)) {
      return (
        <main className="mx-auto min-h-[100dvh] max-w-2xl bg-ground px-4 py-6 pt-safe">
          <Outlet />
        </main>
      );
    }
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="relative flex h-[100dvh] overflow-hidden bg-ground"
      style={{
        '--sidebar-w': collapsed ? '76px' : '256px',
      }}
    >
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-warning px-4 py-2 text-center text-[13px] font-semibold text-white">
          {t('common.offline_banner')}
        </div>
      )}
      {/* Desktop sidebar */}
      <div className={`hidden md:block flex-shrink-0 transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!isFullScreenPage && <TopBar />}
        {/* Suspended by an admin (migrations/0121 refuses new orders): say so up front. */}
        {profile?.status === 'Diblokir' && (
          <div role="alert" className="border-b border-danger-line bg-danger-soft px-4 py-2.5 text-center text-[13px] font-medium text-danger-ink">
            {t('common.suspended_banner')}
          </div>
        )}
        <main className={`relative flex-1 overflow-y-auto overscroll-contain ${isFullScreenPage ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0' : 'px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-6 md:pb-10'}`}>
          <div className={isFullScreenPage ? 'h-full w-full' : isHome ? 'max-w-3xl mx-auto lg:max-w-6xl' : 'max-w-3xl mx-auto'}>
            <Outlet />
          </div>
        </main>
        {/* Mobile bottom nav */}
        <div className="md:hidden">
          <BottomNav />
        </div>

        {/* Wira AI Assistant Floating Action Button & Interactive Sheet */}
        {!isFullScreenPage && (
          <>
            <AIAssistantFAB onClick={() => setIsAIOpen(true)} />
            <AIAssistantSheet open={isAIOpen} onClose={() => setIsAIOpen(false)} />
          </>
        )}
      </div>
    </div>
  );
}
