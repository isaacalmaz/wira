import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, ListOrdered, MessageSquare, Wallet, User, Menu as MenuIcon, ArrowLeftRight } from 'lucide-react';

const MitraLayout = ({ children }) => {
  const { logout, mitraAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Ekstrak role aktif saat ini dari URL (contoh: /mitra/driver/orders -> driver)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const isMitraPrefixed = pathParts[0] === 'mitra';
  const activeRole = isMitraPrefixed 
    ? (pathParts[1] || mitraAccess?.[0] || 'driver')
    : (pathParts[0] || mitraAccess?.[0] || 'driver');
  const basePrefix = isMitraPrefixed ? '/mitra' : '';

  const getNavItems = () => {
    const base = [
      { to: `${basePrefix}/${activeRole}`, icon: Home, label: 'Beranda' },
      { to: `${basePrefix}/${activeRole}/orders`, icon: ListOrdered, label: 'Pesanan' },
    ];
    
    if (activeRole === 'merchant') {
      base.push({ to: `${basePrefix}/merchant/menu`, icon: MenuIcon, label: 'Menu' });
    }
    
    if (activeRole === 'technician') {
      base.push({ to: `${basePrefix}/technician/schedule`, icon: MenuIcon, label: 'Jadwal' });
    }
    
    base.push(
      { to: `${basePrefix}/${activeRole}/earnings`, icon: Wallet, label: 'Pendapatan' },
      { to: `${basePrefix}/${activeRole}/chat`, icon: MessageSquare, label: 'Pesan' },
      { to: `${basePrefix}/${activeRole}/profile`, icon: User, label: 'Profil' }
    );
    
    return base;
  };

  const navItems = getNavItems();

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-800 shadow-lg h-screen sticky top-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">Wira Mitra</h1>
          <p className="text-sm text-slate-500 capitalize">{activeRole}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${activeRole}`}
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
        
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
          {mitraAccess && mitraAccess.length > 1 && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-2">Beralih Dasbor:</p>
              {mitraAccess.filter(r => r !== activeRole).map(role => (
                <button 
                  key={role}
                  onClick={() => navigate(`${basePrefix}/${role}`)} 
                  className="w-full mb-1 flex items-center gap-2 py-2 px-3 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm hover:border-primary hover:text-primary transition-colors capitalize"
                >
                  <ArrowLeftRight size={14} /> Ke {role}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { logout(); navigate(isMitraPrefixed ? '/mitra/login' : '/login'); }} className="w-full py-2 border-2 border-red-500 text-red-500 rounded-lg font-medium hover:bg-red-500 hover:text-white transition-colors">
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-around items-center h-16 z-50 px-2 pb-safe">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/${activeRole}`}
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
