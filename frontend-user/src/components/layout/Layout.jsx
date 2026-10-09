import useOnlineStatus from '../../hooks/useOnlineStatus';
import { lazy, Suspense } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Spinner from '../ui/Spinner';

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
    <div className="flex h-[100dvh] overflow-hidden bg-ground">
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-warning px-4 py-2 text-center text-[13px] font-semibold text-white">
          {t('common.offline_banner')}
        </div>
      )}
      {/* Desktop sidebar */}
      <div className="hidden md:block w-64 flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!isFullScreenPage && <TopBar />}
        <main className={`flex-1 overflow-y-auto ${isFullScreenPage ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0' : 'px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-6 md:pb-10'}`}>
          <div className={isFullScreenPage ? 'h-full w-full' : 'max-w-3xl mx-auto'}>
            <Outlet />
          </div>
        </main>
        {/* Mobile bottom nav */}
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
