import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Menu, Bell, Sun, Moon, LogOut } from 'lucide-react';

const AdminLayout = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-light-bg dark:bg-dark-bg overflow-hidden">
      {/* Sidebar Kiri */}
      <AdminSidebar isCollapsed={isSidebarCollapsed} />

      {/* Konten Utama */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu size={20} />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Selamat datang, <span className="font-semibold text-slate-900 dark:text-white">{user?.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Role Badge */}
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
              {user?.role}
            </span>

            {/* Tombol Tema (Dark Mode) */}
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifikasi */}
            <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Tombol Logout */}
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <LogOut size={20} />
              <span className="hidden sm:block text-sm font-medium">Keluar</span>
            </button>
          </div>
        </header>

        {/* Area Render Halaman */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-[#0B1120] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
