import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, ListOrdered, MessageSquare, Wallet, User, Bell, Menu as MenuIcon } from 'lucide-react';
// Asumsikan komponen OnlineToggle ada
// import OnlineToggle from '../shared/OnlineToggle';

const MitraLayout = ({ children }) => {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  // Menu dinamis berdasarkan role
  const getNavItems = () => {
    const base = [
      { to: `/${role}`, icon: Home, label: 'Beranda' },
      { to: `/${role}/orders`, icon: ListOrdered, label: 'Pesanan' },
    ];
    
    if (role === 'merchant') {
      base.push({ to: '/merchant/menu', icon: MenuIcon, label: 'Menu' });
    }
    
    return [
      ...base,
      { to: `/${role}/chat`, icon: MessageSquare, label: 'Chat' },
      { to: `/${role}/earnings`, icon: Wallet, label: 'Dompet' },
      { to: `/${role}/profile`, icon: User, label: 'Profil' }
    ];
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-16 md:pb-0 md:flex text-slate-800 dark:text-slate-200">
      {/* Top bar (Mobile & Desktop) */}
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-50 p-4 flex justify-between items-center md:hidden">
        <h1 className="text-xl font-bold text-primary">Wira Mitra</h1>
        <div className="flex items-center gap-3">
          <div className="w-12 h-6 bg-green-500 rounded-full relative"><span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></span></div>
          <Bell className="text-slate-500" />
        </div>
      </header>

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-800 shadow-lg h-screen sticky top-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">Wira Mitra</h1>
          <p className="text-sm text-slate-500 capitalize">{role}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${role}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={() => { logout(); navigate('/login'); }} className="w-full py-2 border-2 border-red-500 text-red-500 rounded-lg font-medium hover:bg-red-500 hover:text-white transition-colors">
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex justify-around items-center h-16 z-50">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/${role}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default MitraLayout;
