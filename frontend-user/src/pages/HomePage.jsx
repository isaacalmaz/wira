import { useTranslation } from '../i18n';
import { SERVICES } from '../config/services';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import { Wallet, Navigation, Clock, Package, ShoppingBag, ArrowRight } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { useOrders } from '../context/OrderContext';
import { supabase } from '../config/supabase';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const { t, lang } = useTranslation();
  const { balance } = useWallet();
  const { orders } = useOrders();
  const [activeServices, setActiveServices] = useState(SERVICES.map(s => ({ ...s, enabled: false })));

  const [globalFlags, setGlobalFlags] = useState([]);
  const [userZones, setUserZones] = useState(null);
  const [locationWarning, setLocationWarning] = useState(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  useEffect(() => {
    let currentGlobalFlags = [];

    const updateServices = (flags, zones) => {
      const updatedServices = SERVICES.map(srv => {
        // 1. Cek Global Flag
        const flag = flags.find(f => f.id === srv.id);
        const isGloballyEnabled = flag ? flag.status : srv.enabled;

        // 2. Cek Zone Services
        let isZoneEnabled = false;
        if (zones && zones.length > 0) {
          const serviceKey = srv.id.replace('wira_', '');
          isZoneEnabled = zones.some(zone => zone.services && zone.services[serviceKey] === true);
        }

        // 3. Intersect (hanya aktif jika global aktif DAN zona aktif)
        // Jika tidak ada zona (di luar jangkauan/izin ditolak), semua layanan dimatikan kecuali mungkin yang tidak bergantung lokasi (tapi sesuai instruksi: "disable the respective services").
        return { ...srv, enabled: isGloballyEnabled && isZoneEnabled };
      });
      setActiveServices(updatedServices);
    };

    const fetchGlobalFlags = async () => {
      const { data, error } = await supabase.from('feature_flags').select('features').eq('region', 'features_config').maybeSingle();
      console.log("FEATURE FLAGS FETCH:", { data, error });
      if (data && data.features) {
        currentGlobalFlags = data.features;
        setGlobalFlags(data.features);
      }
      return currentGlobalFlags;
    };

    const fetchLocationAndZones = async (flags) => {
      if (!navigator.geolocation) {
        setLocationWarning('Geolocation tidak didukung browser ini.');
        updateServices(flags, []);
        setIsLoadingLocation(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const { data: zones, error: rpcError } = await supabase.rpc('get_zone_for_location', { lat: latitude, lng: longitude });
            if (rpcError) throw rpcError;

            if (!zones || zones.length === 0) {
              setLocationWarning('Lokasi di luar jangkauan operasional Wira.');
              setUserZones([]);
              updateServices(flags, []);
            } else {
              setLocationWarning(null);
              setUserZones(zones);
              updateServices(flags, zones);
            }
          } catch (err) {
            console.error("RPC Error:", err);
            setLocationWarning('Gagal memverifikasi area operasional.');
            setUserZones([]);
            updateServices(flags, []);
          } finally {
            setIsLoadingLocation(false);
          }
        },
        (err) => {
          console.error("GPS Error:", err);
          let errMsg = 'Izin lokasi ditolak atau tidak tersedia.';
          if (err.code === 1) errMsg = 'Akses GPS ditolak oleh Browser atau Sistem Operasi Anda.';
          if (err.code === 2) errMsg = 'Sinyal GPS tidak tersedia (Coba nyalakan Wi-Fi Anda).';
          if (err.code === 3) errMsg = 'Waktu pencarian sinyal GPS habis (Timeout).';
          setLocationWarning(errMsg);
          setUserZones([]);
          updateServices(flags, []);
          setIsLoadingLocation(false);
        },
        { timeout: 10000 }
      );
    };

    const init = async () => {
      const flags = await fetchGlobalFlags();
      // TEMPORARY ROLLBACK: Skip GPS check and enable based on Global Flags only
      const updatedServices = SERVICES.map(srv => {
        const flag = flags.find(f => f.id === srv.id);
        return { ...srv, enabled: flag ? flag.status : srv.enabled };
      });
      setActiveServices(updatedServices);
      setIsLoadingLocation(false);
      // fetchLocationAndZones(flags); // Disabled temporarily
    };

    init();

    const channel = supabase.channel('feature_flags_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags', filter: "region=eq.features_config" }, (payload) => {
        console.log("REALTIME PAYLOAD:", payload);
        if (payload.new && payload.new.features) {
          setGlobalFlags(payload.new.features);
          // Gunakan userZones dari state closure via functional state update atau reference (we will re-evaluate on render instead)
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!isLoadingLocation) {
       const updateServices = () => {
          const updatedServices = SERVICES.map(srv => {
            const flag = globalFlags.find(f => f.id === srv.id);
            const isGloballyEnabled = flag ? flag.status : srv.enabled;
            // TEMPORARY ROLLBACK: Ignore zone check
            return { ...srv, enabled: isGloballyEnabled };
          });
          setActiveServices(updatedServices);
       };
       updateServices();
    }
  }, [globalFlags, userZones, isLoadingLocation]);

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

      {/* Lokasi / Peringatan Geofencing */}
      {isLoadingLocation && (
        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl text-center flex items-center justify-center gap-2">
           <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
           <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Menentukan lokasi Anda...</span>
        </div>
      )}
      
      {!isLoadingLocation && locationWarning && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-xl flex items-start gap-3">
          <Navigation className="text-red-500 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Lokasi Terbatas</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{locationWarning}</p>
          </div>
        </div>
      )}

      {/* Grid Layanan Utama */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-6 sm:gap-4 mt-6 relative z-10 px-2 sm:px-0">
        {activeServices.map((service) => {
          const IconComponent = service.icon;
            return (
              <Link
                key={service.id}
                to={service.enabled ? service.path : '#'}
                className={`flex flex-col items-center gap-1.5 group ${service.enabled ? "" : "opacity-40 grayscale cursor-not-allowed"}`} onClick={(e) => { if(!service.enabled) e.preventDefault(); }}
              >
                <div
                  style={{ backgroundColor: service.enabled ? service.color : "#94a3b8" }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-200"
                >
                  {IconComponent ? (
                    <IconComponent size={24} className="text-white" />
                  ) : (
                    <span className="text-xl font-bold">
                      {service.name_id.charAt(4)}
                    </span>
                  )}
                </div>
                <span className="text-[11px] sm:text-xs text-center font-bold text-slate-700 dark:text-slate-200 leading-tight">
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
    </div>
  );
}
