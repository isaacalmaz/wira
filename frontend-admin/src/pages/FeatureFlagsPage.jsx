import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { RefreshCw, Save, ToggleLeft, ToggleRight, Sliders } from 'lucide-react';

const INITIAL_FEATURES = [
  { id: 'wira_ride', name: 'WiraRide (Ojek & Taksi Online)', status: true, regions: ['Semua Wilayah'] },
  { id: 'wira_food', name: 'WiraFood (Pesan Antar Makanan)', status: true, regions: ['Kota Mataram', 'Senggigi'] },
  { id: 'wira_send', name: 'WiraSend (Pengiriman Paket & Dokumen)', status: true, regions: ['Semua Wilayah'] },
  { id: 'wira_pay', name: 'WiraPay (Dompet Digital & Saldo)', status: true, regions: ['Semua Wilayah'] },
  { id: 'wira_pulsa', name: 'WiraPulsa (Pulsa & Token Listrik)', status: true, regions: ['Semua Wilayah'] },
  { id: 'wira_villa', name: 'WiraVilla (Sewa Villa & Penginapan)', status: true, regions: ['Senggigi', 'Lombok Tengah'] },
  { id: 'wira_service', name: 'WiraService (Jasa Servis & Tukang)', status: true, regions: ['Kota Mataram'] },
  { id: 'wira_pool', name: 'WiraPool (Tebengan Bersama)', status: false, regions: [] },
];

const FeatureFlagsPage = () => {
  const [features, setFeatures] = useState(INITIAL_FEATURES);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const [configRes, zonesRes] = await Promise.all([
        supabase.from('feature_flags').select('*').eq('region', 'features_config').maybeSingle(),
        supabase.from('feature_flags').select('*').eq('region', 'operational_zones').maybeSingle()
      ]);

      if (configRes.error && configRes.error.code !== 'PGRST116') throw configRes.error;
      if (zonesRes.error && zonesRes.error.code !== 'PGRST116') throw zonesRes.error;

      if (configRes.data && Array.isArray(configRes.data.features) && configRes.data.features.length > 0) {
        setFeatures(configRes.data.features);
      }
      
      if (zonesRes.data && Array.isArray(zonesRes.data.features) && zonesRes.data.features.length > 0) {
        setZones(zonesRes.data.features);
      }
    } catch (err) {
      console.error('Error fetching feature flags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  const toggleFeature = (id) => {
    setFeatures(features.map(f => 
      f.id === id ? { ...f, status: !f.status } : f
    ));
  };

  const toggleZoneService = (zoneId, serviceKey) => {
    setZones(zones.map(z => {
      if (z.id === zoneId) {
        return {
          ...z,
          services: {
            ...z.services,
            [serviceKey]: !z.services[serviceKey]
          }
        };
      }
      return z;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: configError } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'features_config',
          features: features,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (configError) throw configError;

      const { error: zonesError } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'operational_zones',
          features: zones,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (zonesError) throw zonesError;

      toast.success('Konfigurasi fitur & wilayah berhasil disimpan ke cloud!');
    } catch (err) {
      console.warn('Sync error, saving locally:', err);
      localStorage.setItem('wira_features_config', JSON.stringify(features));
      localStorage.setItem('wira_operational_zones', JSON.stringify(zones));
      toast.success('Konfigurasi fitur disimpan secara lokal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="text-primary" size={24} /> Manajemen Fitur (Feature Flags)
          </h1>
          <p className="text-sm text-slate-500">Aktifkan atau nonaktifkan layanan secara dinamis di Pulau Lombok</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchFeatures} 
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Muat Ulang"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </div>
      
      <div className="card overflow-hidden p-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Layanan Global</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Layanan & Fitur</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Status Saklar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {features.map((feature) => (
                <tr key={feature.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900 dark:text-white">{feature.name}</div>
                    <div className="text-xs font-mono text-slate-500">Kunci: {feature.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleFeature(feature.id)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${
                        feature.status ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        feature.status ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className="ml-3 font-semibold text-xs text-slate-700 dark:text-slate-300">
                      {feature.status ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Manajemen Wilayah Operasional</h2>
        {zones.length === 0 ? (
          <div className="p-6 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {loading ? 'Memuat data wilayah...' : 'Tidak ada data wilayah operasional.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {zones.map((zone) => (
              <div key={zone.id} className="card p-5 bg-white dark:bg-slate-800 shadow rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{zone.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{zone.status_text}</p>
                </div>
                <div className="space-y-4 flex-1">
                  {zone.services && Object.keys(zone.services).map((serviceKey) => (
                    <div key={serviceKey} className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                        {serviceKey}
                      </span>
                      <button 
                        onClick={() => toggleZoneService(zone.id, serviceKey)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          zone.services[serviceKey] ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                          zone.services[serviceKey] ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeatureFlagsPage;
