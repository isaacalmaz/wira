import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Activity, Wallet, User, Settings, LogOut } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { SERVICES } from '../../config/services';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
            <User className="text-slate-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
              {user?.user_metadata?.name || user?.name || 'Pengguna Wira'}
            </p>
            <p className="text-xs text-slate-500 truncate max-w-[150px]">
              {user?.user_metadata?.phone || user?.phone || '+62 812-3456-7890'}
            </p>
          </div>
        </div>

        <nav className="space-y-2">
          <Link to="/" className={`flex items-center gap-3 p-3 rounded-lg ${location.pathname === '/' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <Home size={20} />
            <span>{t('nav.home')}</span>
          </Link>
          <Link to="/wallet" className={`flex items-center gap-3 p-3 rounded-lg ${location.pathname === '/wallet' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <Wallet size={20} />
            <span>{t('nav.wallet')}</span>
          </Link>
          <Link to="/activity" className={`flex items-center gap-3 p-3 rounded-lg ${location.pathname === '/activity' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <Activity size={20} />
            <span>{t('nav.activity')}</span>
          </Link>
        </nav>

        <div className="mt-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-3">Layanan</p>
          <nav className="space-y-1">
            {SERVICES.map(service => (
              <Link key={service.id} to={service.path} className={`flex items-center gap-3 p-2 rounded-lg text-sm ${location.pathname.startsWith(service.path) ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                <span className={`w-2 h-2 rounded-full ${service.color}`}></span>
                <span>{service.name_id}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
      
      <div className="mt-auto p-6 border-t border-slate-200 dark:border-slate-700">
        <Link to="/profile" className="flex items-center gap-3 p-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">
          <Settings size={20} />
          <span>Pengaturan</span>
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
          <LogOut size={20} />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );
}
