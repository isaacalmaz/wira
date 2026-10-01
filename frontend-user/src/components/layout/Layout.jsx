import useOnlineStatus from '../../hooks/useOnlineStatus';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Spinner from '../ui/Spinner';

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
