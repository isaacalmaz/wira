import { useState } from 'react';
import { featureFlagsData } from '../data/mockData';
import { toast } from 'react-hot-toast';

const FeatureFlagsPage = () => {
  const [features, setFeatures] = useState(featureFlagsData);

  const toggleFeature = (id) => {
    setFeatures(features.map(f => 
      f.id === id ? { ...f, status: !f.status } : f
    ));
  };

  const handleSave = () => {
    toast.success('Konfigurasi fitur berhasil disimpan!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manajemen Fitur (Feature Flags)</h1>
        <button onClick={handleSave} className="btn-primary">
          Simpan Perubahan
        </button>
      </div>
      
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Nama Fitur</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">Region Aktif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {features.map((feature) => (
                <tr key={feature.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900 dark:text-white">{feature.name}</div>
                    <div className="text-xs text-slate-500">ID: {feature.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleFeature(feature.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        feature.status ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        feature.status ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className="ml-3 text-sm font-medium">
                      {feature.status ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {feature.regions.length > 0 ? (
                        feature.regions.map(region => (
                          <span key={region} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs">
                            {region}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">Tidak ada region (Global Off)</span>
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
