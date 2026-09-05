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

const AdminSidebar = ({ isCollapsed }) => {
  const location = useLocation();
  const { user } = useAuth();

  // Daftar menu sesuai dengan instruksi
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['Superadmin', 'Admin Ops', 'Admin Keuangan', 'CS'] },
    { name: 'Feature Flags', icon: ToggleLeft, path: '/features', roles: ['Superadmin'] },
    { name: 'Users', icon: Users, path: '/users', roles: ['Superadmin', 'Admin Ops', 'CS'] },
    { name: 'Orders', icon: ShoppingBag, path: '/orders', roles: ['Superadmin', 'Admin Ops', 'CS'] },
    { name: 'Drivers', icon: Car, path: '/drivers', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'Merchants', icon: Store, path: '/merchants', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'Technicians', icon: Wrench, path: '/technicians', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'Villas', icon: Home, path: '/villas', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'Keuangan', icon: Wallet, path: '/finance', roles: ['Superadmin', 'Admin Keuangan'] },
    { name: 'Promo', icon: Ticket, path: '/promos', roles: ['Superadmin', 'Admin Ops'] },
    { name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: ['Superadmin', 'CS'] },
    { name: 'Settings', icon: Settings, path: '/settings', roles: ['Superadmin'] },
  ];

  // Filter menu berdasarkan role pengguna
  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <aside className={`bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'} flex flex-col h-full`}>
      {/* Logo Area */}
      <div className="h-16 flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
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

          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-primary/10 text-primary dark:bg-primary/20' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={isCollapsed ? item.name : ''}
            >
              <Icon size={20} className={isActive ? 'text-primary' : ''} />
              {!isCollapsed && <span className="font-medium text-sm">{item.name}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
