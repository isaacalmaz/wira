import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { ShieldAlert, Server, MapPin, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDashboardPage() {
  const [globalServices, setGlobalServices] = useState([]);
  const [operationalZones, setOperationalZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingZones, setSavingZones] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .in('region', ['features_config', 'operational_zones']);

      if (error) throw error;

      if (data) {
        const config = data.find(d => d.region === 'features_config');
        if (config && config.features) {
          // Handle both object and array formats gracefully
          if (Array.isArray(config.features)) {
            setGlobalServices(config.features);
          } else {
            const arr = Object.keys(config.features).map(key => ({
              id: key,
              name: key,
              active: config.features[key] === true
            }));
            setGlobalServices(arr);
          }
        }

        const zones = data.find(d => d.region === 'operational_zones');
        if (zones && zones.features) {
          setOperationalZones(zones.features);
        }
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Gagal memuat data admin');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalToggle = (id) => {
    setGlobalServices(prev => prev.map(service => 
      service.id === id ? { ...service, active: !service.active } : service
    ));
  };

  const handleZoneServiceToggle = (zoneId, serviceKey) => {
    setOperationalZones(prev => prev.map(zone => {
      if (zone.id === zoneId) {
        return {
          ...zone,
          services: {
            ...zone.services,
            [serviceKey]: !zone.services[serviceKey]
          }
        };
      }
      return zone;
    }));
  };

  const saveGlobalServices = async () => {
    setSavingGlobal(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ features: globalServices })
        .eq('region', 'features_config');

      if (error) throw error;
      toast.success('Layanan Global berhasil disimpan!');
    } catch (error) {
      console.error('Error saving global services:', error);
      toast.error('Gagal menyimpan Layanan Global');
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveOperationalZones = async () => {
    setSavingZones(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ features: operationalZones })
        .eq('region', 'operational_zones');

      if (error) throw error;
      toast.success('Wilayah Operasional berhasil disimpan!');
    } catch (error) {
      console.error('Error saving operational zones:', error);
      toast.error('Gagal menyimpan Wilayah Operasional');
    } finally {
      setSavingZones(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-gray-500">Memuat dashboard admin...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in pb-24">
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="p-3 bg-red-100 text-red-600 rounded-xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm">Manajemen Fitur & Wilayah Operasional</p>
        </div>
      </div>

      {/* Global Services Section */}
      <section className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-800">
            <Server className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold">Layanan Global</h2>
          </div>
          <button 
            onClick={saveGlobalServices}
            disabled={savingGlobal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {savingGlobal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
          </button>
        </div>
        <p className="text-gray-500 text-sm">
          Aktifkan atau nonaktifkan layanan secara keseluruhan (berlaku untuk semua wilayah jika tidak ada pengaturan khusus).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {globalServices.map((service) => (
            <div key={service.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
              <span className="font-medium text-gray-700">{service.name || service.id}</span>
              <button
                onClick={() => handleGlobalToggle(service.id)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  service.active ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    service.active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
          {globalServices.length === 0 && (
            <div className="col-span-full p-4 text-center text-gray-500 bg-gray-50 rounded-xl">
              Tidak ada data Layanan Global.
            </div>
          )}
        </div>
      </section>

      {/* Operational Zones Section */}
      <section className="bg-white rounded-2xl shadow-sm border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-800">
            <MapPin className="w-6 h-6 text-green-500" />
            <h2 className="text-xl font-bold">Wilayah Operasional</h2>
          </div>
          <button 
            onClick={saveOperationalZones}
            disabled={savingZones}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {savingZones ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
          </button>
        </div>
        <p className="text-gray-500 text-sm">
          Atur ketersediaan layanan untuk masing-masing wilayah secara spesifik.
        </p>

        <div className="space-y-4">
          {operationalZones.map((zone) => (
            <div key={zone.id} className="border rounded-xl p-4 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{zone.name}</h3>
                  <p className="text-xs text-gray-500">{zone.status_text}</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                {zone.services && Object.entries(zone.services).map(([key, isActive]) => (
                  <div key={key} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border">
                    <span className="text-sm font-medium text-gray-700 capitalize">{key}</span>
                    <button
                      onClick={() => handleZoneServiceToggle(zone.id, key)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          isActive ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {operationalZones.length === 0 && (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-xl">
              Tidak ada data Wilayah Operasional.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
