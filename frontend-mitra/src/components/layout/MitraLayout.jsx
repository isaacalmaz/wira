import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, ListOrdered, MessageSquare, Wallet, User, Menu as MenuIcon, ArrowLeftRight, Building2, Car, Store, Wrench } from 'lucide-react';

// The underlying mitra_access value for the restaurant portal is still the
// literal string 'merchant' (kept as-is so existing accounts/routes don't
// break), but it's displayed everywhere else as "Restoran" now that Villa
// is a separate portal - this keeps the sidebar label consistent with that.
// 'courier' no longer exists as its own portal (see migrations/0033) - Driver
// now covers Ride/Kurir/Makanan together via Settings preferences.
const ROLE_DISPLAY_LABEL = { driver: 'Driver', merchant: 'Restoran', villa: 'Villa', technician: 'Teknisi' };
const ROLE_ICON = { driver: Car, merchant: Store, villa: Building2, technician: Wrench };

const MitraLayout = ({ children }) => {
  const { logout, mitraAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Ekstrak role aktif saat ini dari URL (contoh: /driver/orders -> driver).
  // Semua route di App.jsx berakar langsung di /driver, /merchant, /technician
  // (tidak pernah di bawah prefix /mitra), jadi tidak perlu cabang tambahan.
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeRole = pathParts[0] || mitraAccess?.[0] || 'driver';

  const getNavItems = () => {
    const base = [
      { to: `/${activeRole}`, icon: Home, label: 'Beranda' },
      { to: `/${activeRole}/orders`, icon: ListOrdered, label: 'Pesanan' },
    ];

    if (activeRole === 'merchant') {
      base.push({ to: `/merchant/menu`, icon: MenuIcon, label: 'Menu' });
    }

    if (activeRole === 'villa') {
      base.push({ to: `/villa/listing`, icon: Building2, label: 'Listing' });
    }

    if (activeRole === 'technician') {
      base.push({ to: `/technician/schedule`, icon: MenuIcon, label: 'Jadwal' });
    }

    // Driver and Kurir deliberately get NO 4th nav tab here, unlike
    // merchant/villa/technician. Each of those three has a real standalone
    // management surface behind its extra tab (a product catalog, a listing
    // editor, a work calendar) that doesn't fit inside Beranda/Pesanan.
    // Driver/Kurir have no equivalent - there's no separate "thing to
    // manage" beyond the incoming-job screen (Beranda) and the job list
    // (Pesanan) itself, so Beranda/Pesanan/Pendapatan/Profil is already the
    // complete set. Forcing a 4th tab here just to match tab-count would add
    // a dead-end screen, not real parity - so this asymmetry stays, on
    // purpose, after reviewing it.

    base.push(
      { to: `/${activeRole}/earnings`, icon: Wallet, label: 'Pendapatan' },
      { to: `/${activeRole}/profile`, icon: User, label: 'Profil' }
    );

    return base;
  };

  const navItems = getNavItems();
  const ActiveRoleIcon = ROLE_ICON[activeRole];

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-800 shadow-lg h-screen sticky top-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">Wira Mitra</h1>
          <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
            {ActiveRoleIcon && <ActiveRoleIcon size={14} />}
            {ROLE_DISPLAY_LABEL[activeRole] || activeRole}
          </p>
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
