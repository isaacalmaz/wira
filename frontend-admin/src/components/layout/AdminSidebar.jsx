import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  ToggleLeft, 
  Users, 
  ShoppingBag, 
  Car, 
  Store, 
  Wrench, 
  Home, 
  Wallet, 
  Ticket, 
  MessageCircle, 
  Settings 
} from 'lucide-react';
import { supabase } from '../../config/supabase';

const AdminSidebar = ({ isCollapsed }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [pendingCounts, setPendingCounts] = useState({ driver: 0, merchant: 0, technician: 0 });

  const fetchPendingCounts = async () => {
    try {
      const { data } = await supabase
        .from('feature_flags')
        .select('features')
        .eq('region', 'mitra_registrations')
        .maybeSingle();

      let list = Array.isArray(data?.features) ? data.features : [];
      
      // Fallback local
      try {
        const local = JSON.parse(localStorage.getItem('wira_mitra_registrations') || '[]');
        const existingIds = new Set(list.map((m) => m.id));
        for (const item of local) {
          if (!existingIds.has(item.id)) list.push(item);
        }
      } catch (e) {}

      const driverCount = list.filter((m) => m.role === 'driver' && m.status === 'Pending').length;
      const merchantCount = list.filter((m) => m.role === 'merchant' && m.status === 'Pending').length;
      const techCount = list.filter((m) => m.role === 'technician' && m.status === 'Pending').length;

      setPendingCounts({ driver: driverCount, merchant: merchantCount, technician: techCount });
    } catch (err) {}
  };

  useEffect(() => {
    fetchPendingCounts();

    const channel = supabase
      .channel('realtime-sidebar-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        (payload) => {
          if (payload.new && payload.new.region === 'mitra_registrations') {
            fetchPendingCounts();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Daftar menu sesuai dengan instruksi
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['Superadmin', 'Admin Ops', 'Admin Keuangan', 'CS'] },
    { name: 'Feature Flags', icon: ToggleLeft, path: '/features', roles: ['Superadmin'] },
    { name: 'Users', icon: Users, path: '/users', roles: ['Superadmin', 'Admin Ops', 'CS'] },
    { name: 'Orders', icon: ShoppingBag, path: '/orders', roles: ['Superadmin', 'Admin Ops', 'CS'] },
    { name: 'Drivers', icon: Car, path: '/drivers', roles: ['Superadmin', 'Admin Ops'], countKey: 'driver' },
    { name: 'Merchants', icon: Store, path: '/merchants', roles: ['Superadmin', 'Admin Ops'], countKey: 'merchant' },
    { name: 'Technicians', icon: Wrench, path: '/technicians', roles: ['Superadmin', 'Admin Ops'], countKey: 'technician' },
    { name: 'Villas', icon: Home, path: '/villas', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'Keuangan', icon: Wallet, path: '/finance', roles: ['Superadmin', 'Admin Keuangan'] },
    { name: 'Promo', icon: Ticket, path: '/promos', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: ['Superadmin', 'CS'] },
    { name: 'Settings', icon: Settings, path: '/settings', roles: ['Superadmin'] },
  ];

  // Filter menu berdasarkan role pengguna
  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <aside className={`fixed top-0 left-0 z-50 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'} flex flex-col h-screen shadow-sm`}>
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-center border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 text-primary font-bold text-2xl">
          <span className="bg-primary text-white p-1 rounded-lg">W</span>
          {!isCollapsed && <span>Wira Admin</span>}
        </div>
      </div>

      {/* Navigasi */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {filteredMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          const badgeCount = item.countKey ? pendingCounts[item.countKey] : 0;

          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative ${
                isActive 
                  ? 'bg-primary/10 text-primary dark:bg-primary/20' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={isCollapsed ? `${item.name}${badgeCount > 0 ? ` (${badgeCount} menunggu)` : ''}` : ''}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? 'text-primary' : ''} />
                {isCollapsed && badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                )}
              </div>
              {!isCollapsed && (
                <>
                  <span className="font-medium text-sm">{item.name}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                      {badgeCount}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
