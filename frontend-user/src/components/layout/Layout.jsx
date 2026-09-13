import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';

export default function Layout() {
  const location = useLocation();
  const isFullScreenPage = ['/ride'].includes(location.pathname);
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className={`flex-1 overflow-y-auto pb-16 md:pb-0 ${isFullScreenPage ? '' : 'p-4'}`}>
          <div className={isFullScreenPage ? 'h-full w-full' : 'max-w-4xl mx-auto'}>
            <Outlet />
          </div>
        </main>
        {/* Mobile Bottom Nav */}
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
