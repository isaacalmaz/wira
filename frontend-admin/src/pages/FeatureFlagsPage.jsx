import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { RefreshCw, Save, ToggleLeft, ToggleRight, Sliders } from 'lucide-react';

const INITIAL_FEATURES = [
  { id: 'ride', name: 'WiraRide (Ojek & Taksi Online)', status: true, regions: ['Semua Wilayah'] },
  { id: 'food', name: 'WiraFood (Pesan Antar Makanan)', status: true, regions: ['Kota Mataram', 'Senggigi'] },
  { id: 'send', name: 'WiraSend (Pengiriman Paket & Dokumen)', status: true, regions: ['Semua Wilayah'] },
  { id: 'pay', name: 'WiraPay (Dompet Digital & Saldo)', status: true, regions: ['Semua Wilayah'] },
  { id: 'pulsa', name: 'WiraPulsa (Pulsa & Token Listrik)', status: true, regions: ['Semua Wilayah'] },
  { id: 'villa', name: 'WiraVilla (Sewa Villa & Penginapan)', status: true, regions: ['Senggigi', 'Lombok Tengah'] },
  { id: 'service', name: 'WiraService (Jasa Servis & Tukang)', status: true, regions: ['Kota Mataram'] },
  { id: 'pool', name: 'WiraPool (Tebengan Bersama)', status: false, regions: [] },
];

const FeatureFlagsPage = () => {
  const [features, setFeatures] = useState(INITIAL_FEATURES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('region', 'features_config')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && Array.isArray(data.features) && data.features.length > 0) {
        setFeatures(data.features);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'features_config',
          features: features,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (error) throw error;
      toast.success('Konfigurasi fitur berhasil disimpan ke cloud!');
    } catch (err) {
      console.warn('Sync error, saving locally:', err);
      localStorage.setItem('wira_features_config', JSON.stringify(features));
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Layanan & Fitur</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Status Saklar</th>
                <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Wilayah Berlaku</th>
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
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {feature.regions && feature.regions.length > 0 ? (
                        feature.regions.map(region => (
                          <span key={region} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs">
                            {region}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">Nonaktif secara global</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FeatureFlagsPage;
