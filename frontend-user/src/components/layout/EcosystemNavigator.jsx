import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Smartphone, 
  Car, 
  Store, 
  Wrench, 
  ShieldCheck, 
  Network, 
  ChevronDown, 
  Sparkles,
  UserCheck,
  Zap,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { createEcosystemOrder } from '../../services/ecosystemService';
import toast from 'react-hot-toast';

export default function EcosystemNavigator() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const currentPath = location.pathname;

  const isUserActive = !currentPath.startsWith('/admin') && !currentPath.startsWith('/mitra') && !currentPath.startsWith('/schematics');
  const isDriverActive = currentPath.startsWith('/mitra/driver');
  const isMerchantActive = currentPath.startsWith('/mitra/merchant');
  const isTechActive = currentPath.startsWith('/mitra/technician');
  const isAdminActive = currentPath.startsWith('/admin');
  const isSchematicsActive = currentPath.startsWith('/schematics');

  const handleSimulateInstantOrder = () => {
    const newOrder = createEcosystemOrder({
      serviceType: 'ride',
      title: 'Order Kilat: Mataram Mall ➔ Senggigi',
      details: 'Pengujian order antar-portal Wira Super-App',
      price: 28000,
      customerName: 'Lalu Hendra (Pengguna Uji)',
      paymentMethod: 'WiraPay',
    });
    toast.success(`Pesanan ${newOrder.id} berhasil diterbitkan ke Ekosistem! Driver & Admin dapat melihatnya.`, {
      duration: 4000,
      icon: '🚀'
    });
  };

  const handleQuickLoginAs = (role) => {
    setShowRoleMenu(false);
    if (role === 'superadmin') {
      const adminUser = {
        id: 'adm-super-01',
        name: 'Budi Wira (Superadmin)',
        email: 'admin@wira.app',
        role: 'Superadmin'
      };
      localStorage.setItem('wira_admin_demo_user', JSON.stringify(adminUser));
      toast.success('Beralih peran: Superadmin Wira');
      navigate('/admin/dashboard');
    } else if (role === 'driver') {
      const driverUser = {
        id: 'drv-made-01',
        name: 'Made Suardana',
        email: 'driver@wira.app',
        phone: '081987654321',
        mitra_access: ['driver'],
      };
      localStorage.setItem('wira_mitra_demo_user', JSON.stringify(driverUser));
      toast.success('Beralih peran: Mitra Driver (Made Suardana)');
      navigate('/mitra/driver');
    } else if (role === 'merchant') {
      const merchantUser = {
        id: 'merch-taliwang-01',
        name: 'Ayam Taliwang Bu Siti',
        email: 'merchant@wira.app',
        mitra_access: ['merchant'],
      };
      localStorage.setItem('wira_mitra_demo_user', JSON.stringify(merchantUser));
      toast.success('Beralih peran: Mitra Resto (Bu Siti)');
      navigate('/mitra/merchant');
    } else if (role === 'technician') {
      const techUser = {
        id: 'tech-agus-01',
        name: 'Agus Santoso (Teknisi)',
        email: 'tech@wira.app',
        mitra_access: ['technician'],
      };
      localStorage.setItem('wira_mitra_demo_user', JSON.stringify(techUser));
      toast.success('Beralih peran: Mitra Teknisi (Agus)');
      navigate('/mitra/technician');
    } else if (role === 'user') {
      toast.success('Beralih peran: Pelanggan Wira Lombok');
      navigate('/');
    }
  };

  if (isCollapsed) {
    return (
      <div className="fixed top-2 right-2 z-50">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 text-cyan-400 border border-cyan-500/40 shadow-xl backdrop-blur-md text-xs font-bold hover:bg-slate-800 transition-all"
          title="Buka Navigator Ekosistem Wira"
        >
          <Sparkles size={14} className="text-cyan-400" />
          <span>Wira Hub</span>
          <Maximize2 size={12} className="text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 text-white transition-all shadow-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        
        {/* Brand & Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/" className="flex items-center gap-1.5 group">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-cyan-400 text-white font-black text-sm flex items-center justify-center shadow-sm shadow-cyan-900/40">
              W
            </span>
            <div className="leading-none hidden lg:block">
              <span className="font-extrabold text-sm tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                Wira
              </span>
              <span className="text-[10px] block text-cyan-400 font-semibold tracking-wider uppercase">
                Lombok
              </span>
            </div>
          </Link>
          <span className="hidden xl:inline-block h-4 w-[1px] bg-slate-800"></span>
        </div>

        {/* Portal Switcher Buttons */}
        <nav className="flex items-center gap-1 shrink-0 text-xs">
          
          {/* User App */}
          <Link
            to="/"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isUserActive 
                ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone size={14} className={isUserActive ? 'text-white' : 'text-cyan-400'} />
            <span>Pelanggan</span>
          </Link>

          {/* Mitra Driver */}
          <Link
            to="/mitra/driver"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isDriverActive 
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-900/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Car size={14} className={isDriverActive ? 'text-white' : 'text-amber-400'} />
            <span>Driver</span>
          </Link>

          {/* Mitra Resto */}
          <Link
            to="/mitra/merchant"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isMerchantActive 
                ? 'bg-orange-600 text-white shadow-sm shadow-orange-900/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Store size={14} className={isMerchantActive ? 'text-white' : 'text-orange-400'} />
            <span>Resto</span>
          </Link>

          {/* Mitra Teknisi */}
          <Link
            to="/mitra/technician"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isTechActive 
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Wrench size={14} className={isTechActive ? 'text-white' : 'text-blue-400'} />
            <span className="hidden sm:inline">Teknisi</span>
          </Link>

          {/* Admin Command Center */}
          <Link
            to="/admin/dashboard"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isAdminActive 
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck size={14} className={isAdminActive ? 'text-white' : 'text-emerald-400'} />
            <span>Admin</span>
          </Link>

          {/* Schematics Inspector */}
          <Link
            to="/schematics"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              isSchematicsActive 
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-900/50' 
                : 'text-purple-300 hover:text-white hover:bg-purple-950/40 border border-purple-800/40'
            }`}
          >
            <Network size={14} className={isSchematicsActive ? 'text-white' : 'text-purple-400'} />
            <span className="hidden md:inline">Skematik Sistem</span>
            <span className="md:hidden">Skema</span>
          </Link>

        </nav>

        {/* Quick Simulator & Role Switcher */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs relative">
          
          {/* Quick Order Simulator */}
          <button
            onClick={handleSimulateInstantOrder}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold border border-slate-700 transition-all"
            title="Kirim pesanan tes real-time ke semua portal"
          >
            <Zap size={13} className="text-amber-400" />
            <span className="hidden lg:inline">Tes Order Kilat</span>
          </button>

          {/* Demo Persona Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
              title="Ganti Peran Pengguna Demo"
            >
              <UserCheck size={13} className="text-cyan-400" />
              <span className="hidden md:inline">Ganti Akun Demo</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1 animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Pilih Akun Demo Cepat
                </div>
                <button
                  onClick={() => handleQuickLoginAs('user')}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                >
                  <Smartphone size={14} className="text-cyan-400" />
                  <div>
                    <div className="font-semibold text-white">Pelanggan Lombok</div>
                    <div className="text-[10px] text-slate-400">Saldo: Rp 150.000 (WiraPay)</div>
                  </div>
                </button>
                <button
                  onClick={() => handleQuickLoginAs('driver')}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                >
                  <Car size={14} className="text-amber-400" />
                  <div>
                    <div className="font-semibold text-white">Made Suardana (Driver)</div>
                    <div className="text-[10px] text-slate-400">Honda Vario • DR 4589 AA</div>
                  </div>
                </button>
                <button
                  onClick={() => handleQuickLoginAs('merchant')}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                >
                  <Store size={14} className="text-orange-400" />
                  <div>
                    <div className="font-semibold text-white">Resto Bu Siti (Food)</div>
                    <div className="text-[10px] text-slate-400">Kuliner Taliwang Mataram</div>
                  </div>
                </button>
                <button
                  onClick={() => handleQuickLoginAs('technician')}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                >
                  <Wrench size={14} className="text-blue-400" />
                  <div>
                    <div className="font-semibold text-white">Agus Santoso (Teknisi)</div>
                    <div className="text-[10px] text-slate-400">Service AC & Pompa Air</div>
                  </div>
                </button>
                <div className="border-t border-slate-800 my-1"></div>
                <button
                  onClick={() => handleQuickLoginAs('superadmin')}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200"
                >
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <div>
                    <div className="font-semibold text-white">Budi Wira (Superadmin)</div>
                    <div className="text-[10px] text-slate-400">Akses Penuh Manajemen</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Minimize button */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Sembunyikan Navigator"
          >
            <Minimize2 size={13} />
          </button>

        </div>

      </div>
    </header>
  );
}
