import { useTranslation } from '../i18n';
import { SERVICES } from '../config/services';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import { Wallet, Clock, Package, ShoppingBag, ArrowRight, Settings2, X } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { supabase } from '../config/supabase';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { t, lang } = useTranslation();
  const { balance } = useWallet();
  const { orders } = useOrders();
  const [activeServices, setActiveServices] = useState(SERVICES);
  const [globalFlags, setGlobalFlags] = useState([]);
  const [hiddenServices, setHiddenServices] = useState(() => {
    try {
      const saved = localStorage.getItem('hiddenServices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);

  useEffect(() => {
    const updateServices = (flags) => {
      const updatedServices = SERVICES.map(srv => {
        const flag = flags?.find(f => f.id === srv.id);
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
    };

    const fetchGlobalFlags = async () => {
      const { data, error } = await supabase.from('feature_flags').select('features').eq('region', 'features_config').maybeSingle();
      console.log("FEATURE FLAGS FETCH:", { data, error });
      if (data && data.features) {
        setGlobalFlags(data.features);
        updateServices(data.features);
      }
    };

    const init = async () => {
      await fetchGlobalFlags();
    };

    init();

    const channel = supabase.channel('feature_flags_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags', filter: "region=eq.features_config" }, (payload) => {
        console.log("REALTIME PAYLOAD:", payload);
        if (payload.new && payload.new.features) {
          setGlobalFlags(payload.new.features);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const updateServices = () => {
      const updatedServices = SERVICES.map(srv => {
        const flag = globalFlags.find(f => f.id === srv.id);
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
    };
    updateServices();
  }, [globalFlags]);

  const recentOrders = orders.slice(0, 3);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Kartu Dompet WiraPay */}
      <div className="bg-gradient-to-r from-primary via-cyan-600 to-primary-light text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
            {t('home.wallet_balance')}
          </p>
          <Wallet size={20} className="text-cyan-200" />
        </div>
        <p className="text-3xl sm:text-4xl font-extrabold mb-5 tracking-tight">
          {formatRupiah(balance)}
        </p>
        <div className="flex gap-3">
          <Link
            to="/wallet"
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center justify-center text-white"
          >
            + {t('wallet.top_up')}
          </Link>
          <Link
            to="/wallet"
            className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition flex items-center justify-center text-white"
          >
            ➔ {t('wallet.transfer')}
          </Link>
        </div>
      </div>


      {/* Header & Atur Menu */}
      <div className="flex justify-between items-center mt-6 mb-2 px-2 sm:px-0">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white">
          {t('home.services') || 'Layanan'}
        </h2>
        <button
          onClick={() => setIsMenuModalOpen(true)}
          className="text-xs font-bold text-primary flex items-center gap-1 bg-primary/10 hover:bg-primary/20 transition px-3 py-1.5 rounded-full"
        >
          <Settings2 size={14} /> Atur Menu
        </button>
      </div>

      {/* Grid Layanan Utama */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-6 sm:gap-4 relative z-10 px-2 sm:px-0">
        {activeServices.filter(s => !hiddenServices.includes(s.id)).map((service) => {
          const IconComponent = service.icon;
            return (
              <Link
                key={service.id}
                to={service.enabled ? service.path : '#'}
                className={`flex flex-col items-center gap-2 group ${service.enabled ? "" : "opacity-40 grayscale cursor-not-allowed"}`} onClick={(e) => { if(!service.enabled) e.preventDefault(); }}
              >
                <div
                  style={{ backgroundColor: service.enabled ? service.color : "#94a3b8" }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center text-white shadow-md group-hover:scale-105 group-hover:shadow-lg transition-all duration-200"
                >
                  {IconComponent ? (
                    <IconComponent size={32} className="text-white" />
                  ) : (
                    <span className="text-2xl font-bold">
                      {service.name_id.charAt(4)}
                    </span>
                  )}
                </div>
                <span className="text-xs sm:text-sm text-center font-bold text-slate-700 dark:text-slate-200 leading-tight">
                  {lang === 'id'
                    ? service.name_id.replace('Wira', '')
                    : service.name_en.replace('Wira', '')}
                </span>
              </Link>
            );
          })}
        </div>

      {/* Aktivitas Terkini (Real-time dari Pesanan User) */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">
            {t('home.recent')}
          </h2>
          <Link
            to="/activity"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            Lihat Semua <ArrowRight size={13} />
          </Link>
        </div>

        <div className="space-y-2.5">
          {recentOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
              Belum ada pesanan terbaru. Yuk coba pesan WiraRide atau WiraFood!
            </div>
          ) : (
            recentOrders.map((ord) => (
              <Link key={ord.id} to="/activity" className="block">
                <Card className="p-3.5 flex items-center gap-3.5 hover:border-primary/50 transition border border-slate-200 dark:border-slate-700">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-base">
                    {ord.service === 'WiraRide' ? '🛵' : ord.service === 'WiraFood' ? '🍔' : '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {ord.title}
                    </p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock size={10} /> {ord.date} • <span className="font-medium text-green-600">{ord.status}</span>
                    </p>
                  </div>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    {formatRupiah(ord.price)}
                  </span>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
      {/* Menu Customization Modal */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl transform transition-all">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl text-slate-900 dark:text-white">Atur Menu</h3>
              <button onClick={() => setIsMenuModalOpen(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {activeServices.map(service => {
                const isHidden = hiddenServices.includes(service.id);
                return (
                  <div key={service.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: service.color }}>
                        {service.icon ? <service.icon size={24} /> : <span className="font-bold text-lg">{service.name_id.charAt(4)}</span>}
                      </div>
                      <span className="font-bold text-sm text-slate-700 dark:text-slate-200">
                        {lang === 'id' ? service.name_id.replace('Wira', '') : service.name_en.replace('Wira', '')}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const newHidden = isHidden ? hiddenServices.filter(id => id !== service.id) : [...hiddenServices, service.id];
                        setHiddenServices(newHidden);
                        localStorage.setItem('hiddenServices', JSON.stringify(newHidden));
                      }}
                      className={`w-14 h-7 rounded-full relative transition-colors duration-300 ease-in-out shadow-inner ${!isHidden ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 ease-in-out shadow-sm ${!isHidden ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
