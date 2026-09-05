import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Menu, Bell, Sun, Moon, LogOut, Check, ExternalLink, Clock } from 'lucide-react';

const AdminLayout = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Daftar notifikasi awal
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'Pendaftaran Mitra Baru',
      desc: 'Driver baru mendaftar dan menunggu verifikasi Anda.',
      time: 'Baru saja',
      unread: true,
      link: '/drivers',
      type: 'driver',
    },
    {
      id: 2,
      title: 'Pesanan WiraFood Sukses',
      desc: 'Pesanan Ayam Taliwang di Mataram telah selesai.',
      time: '10 menit lalu',
      unread: true,
      link: '/orders',
      type: 'order',
    },
    {
      id: 3,
      title: 'Sistem Supabase Terhubung',
      desc: 'Database Supabase aktif di region Singapore.',
      time: '1 jam lalu',
      unread: false,
      link: '/settings',
      type: 'system',
    },
  ]);

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
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-20 relative">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Perluas / Ciutkan Menu"
            >
              <Menu size={20} />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Selamat datang,{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {user?.name || 'Administrator'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Role Badge */}
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
              {user?.role || 'Superadmin'}
            </span>

            {/* Tombol Tema (Dark Mode) */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Ganti Tema Gelap / Terang"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Tombol Lonceng Notifikasi Interaktif */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 relative transition ${
                  showNotifications ? 'bg-slate-100 dark:bg-slate-800 text-primary' : ''
                }`}
                title="Lihat Notifikasi"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>

              {/* Menu Dropdown Notifikasi */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                        Notifikasi
                      </h3>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 font-bold px-1.5 py-0.5 rounded-full">
                          {unreadCount} baru
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Check size={14} /> Tandai dibaca
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        Tidak ada notifikasi baru
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => {
                            markAsRead(notif.id);
                            if (notif.link) {
                              setShowNotifications(false);
                              navigate(notif.link);
                            }
                          }}
                          className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition flex gap-3 items-start ${
                            notif.unread ? 'bg-cyan-50/40 dark:bg-cyan-950/20' : ''
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              notif.type === 'driver'
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                                : notif.type === 'order'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600'
                            }`}
                          >
                            {notif.type === 'driver' ? '🛵' : notif.type === 'order' ? '📦' : '⚙️'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                              <span>{notif.title}</span>
                              {notif.unread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {notif.desc}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                              <Clock size={10} /> {notif.time}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 px-3 border-t border-slate-100 dark:border-slate-700 text-center">
                    <Link
                      to="/drivers"
                      onClick={() => setShowNotifications(false)}
                      className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 py-1"
                    >
                      Buka Halaman Verifikasi Driver <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Tombol Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              title="Keluar dari Dashboard Admin"
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
