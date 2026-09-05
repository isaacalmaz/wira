import { useTranslation } from '../i18n';
import { SERVICES } from '../config/services';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';
import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import { Wallet, Navigation, Clock, Package } from 'lucide-react';

export default function HomePage() {
  const { t, lang } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary to-primary-light text-white p-6 rounded-2xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm opacity-90">{t('home.wallet_balance')}</p>
          <Wallet size={20} />
        </div>
        <p className="text-3xl font-bold mb-4">{formatRupiah(150000)}</p>
        <div className="flex gap-4">
          <button className="flex-1 bg-white/20 hover:bg-white/30 py-2 rounded-xl text-sm font-medium transition">
            {t('wallet.top_up')}
          </button>
          <button className="flex-1 bg-white/20 hover:bg-white/30 py-2 rounded-xl text-sm font-medium transition">
            {t('wallet.transfer')}
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-4 dark:text-white">Layanan Kami</h2>
        <div className="grid grid-cols-4 gap-4">
          {SERVICES.map(service => (
            <Link key={service.id} to={service.path} className="flex flex-col items-center gap-2 group">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md ${service.color} group-hover:scale-105 transition-transform`}>
                <span className="text-xl font-bold">{service.name_id.charAt(4)}</span>
              </div>
              <span className="text-xs text-center font-medium text-slate-700 dark:text-slate-300">
                {lang === 'id' ? service.name_id.replace('Wira', '') : service.name_en.replace('Wira', '')}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-4 dark:text-white">{t('home.recent')}</h2>
        <div className="space-y-3">
          <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center">
              <Navigation size={20} />
            </div>
            <div className="flex-1">
              <p className="font-medium dark:text-white">Perjalanan ke Epicentrum Mall</p>
              <p className="text-xs text-slate-500">Kemarin, 14:30</p>
            </div>
            <span className="text-sm font-bold">{formatRupiah(25000)}</span>
          </Card>
          <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
              <Package size={20} />
            </div>
            <div className="flex-1">
              <p className="font-medium dark:text-white">Pesan Makanan - Ayam Taliwang</p>
              <p className="text-xs text-slate-500">2 hari lalu, 19:00</p>
            </div>
            <span className="text-sm font-bold">{formatRupiah(65000)}</span>
          </Card>
        </div>
      </div>
    </div>
  );
}
