import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Menu, Bell, Sun, Moon, LogOut, Check, ExternalLink, Clock } from 'lucide-react';
import { supabase } from '../../config/supabase';

const AdminLayout = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Hanya Notifikasi Asli dari Supabase
  const [notifications, setNotifications] = useState([]);

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

  // Ambil notifikasi awal dari Supabase Cloud & dengarkan Real-time
  useEffect(() => {
    const fetchInitialNotifs = async () => {
      try {
        const { data } = await supabase
          .from('feature_flags')
          .select('features')
          .eq('region', 'mitra_registrations')
          .maybeSingle();

        if (data && Array.isArray(data.features)) {
          const pendings = data.features.filter((m) => m.status === 'Pending' || m.status === 'Menunggu Verifikasi');
          if (pendings.length > 0) {
            const dynamicNotifs = pendings.map((m) => ({
              id: m.id,
              title: `Pendaftaran ${m.role === 'driver' ? 'Driver' : m.role === 'merchant' ? 'Restoran' : 'Teknisi'} Baru`,
              desc: `${m.name} (${m.phone}) menunggu verifikasi.`,
              time: m.created_at ? new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Baru saja',
              unread: true,
              link: m.role === 'driver' ? '/drivers' : m.role === 'merchant' ? '/merchants' : '/technicians',
              type: m.role,
            }));

            setNotifications(dynamicNotifs);
          } else {
            setNotifications([]);
          }
        }
      } catch (err) {
        console.error('Error memuat notifikasi riil:', err);
      }
    };

    fetchInitialNotifs();

    // Listener Real-time
    const channel = supabase
      .channel('realtime-admin-notifs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            fetchInitialNotifs();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDarkMode ? 'dark bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Sidebar */}
      <AdminSidebar isCollapsed={isSidebarCollapsed} setCollapsed={setSidebarCollapsed} />

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-bold hidden sm:block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Wira Admin Portal
            </h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            
            <a 
              href="https://wira-pied.vercel.app/" 
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
            >
              <ExternalLink size={16} /> Buka App User
            </a>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </button>

              {/* Dropdown Panel */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden transform opacity-100 scale-100 transition-all origin-top-right">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      Notifikasi <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">{unreadCount} Baru</span>
                    </h3>
                    <button 
                      onClick={markAllRead}
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      Tandai sudah dibaca
                    </button>
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                        <Bell className="mx-auto mb-2 opacity-20" size={32} />
                        <p className="text-sm">Tidak ada notifikasi riil baru</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            className={`p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${notif.unread ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                            onClick={() => markAsRead(notif.id)}
                          >
                            <Link to={notif.link} onClick={() => setShowNotifications(false)} className="flex gap-4">
                              <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                notif.type === 'driver' ? 'bg-amber-100 text-amber-600' : 
                                notif.type === 'merchant' ? 'bg-emerald-100 text-emerald-600' : 
                                notif.type === 'technician' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {notif.type === 'system' ? <Check size={16} /> : <Bell size={16} />}
                              </div>
                              <div className="flex-1">
                                <h4 className={`text-sm font-semibold ${notif.unread ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {notif.title}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.desc}</p>
                                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                                  <Clock size={10} /> {notif.time}
                                </p>
                              </div>
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center">
                    <button className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
                      Lihat Semua Riwayat Notifikasi
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3 pl-3 sm:pl-4 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none mb-1">{user?.name || 'Administrator'}</p>
                <p className="text-xs text-slate-500 leading-none">{user?.role || 'Super Admin'}</p>
              </div>
              <div className="relative group">
                <img 
                  src={`https://ui-avatars.com/api/?name=${user?.name || 'Admin'}&background=0891B2&color=fff&bold=true`} 
                  alt="Admin" 
                  className="w-9 h-9 rounded-full border-2 border-slate-200 dark:border-slate-700 cursor-pointer"
                />
                
                {/* Profile Dropdown */}
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="p-3 border-b border-slate-200 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name || 'Administrator'}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email || 'admin@wira.app'}</p>
                  </div>
                  <div className="p-1">
                    <button 
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }} 
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <LogOut size={16} /> Keluar Sistem
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in pb-24">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
