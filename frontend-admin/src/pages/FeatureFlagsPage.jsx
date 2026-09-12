import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { RefreshCw, Save, ToggleLeft, ToggleRight, Sliders, Map as MapIcon, X, Trash2, Edit } from 'lucide-react';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';


// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

const MapModal = ({ zone, onClose, onSaveMap }) => {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);

  React.useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current).setView([-8.5830695, 116.1165279], 10);
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM'
    }).addTo(map);

    // Setup Geoman
    if (map.pm) {
      map.pm.addControls({
        position: 'topleft',
        drawMarker: false, drawCircleMarker: false, drawPolyline: false,
        drawRectangle: false, drawCircle: false, drawText: false,
        editMode: true, dragMode: true, cutPolygon: false, removalMode: true,
      });
    }

    // Load initial GeoJSON
    if (zone.geojson && Object.keys(zone.geojson).length > 0) {
      try {
        const layer = L.geoJSON(zone.geojson).addTo(map);
        if (layer.getBounds().isValid()) {
          map.fitBounds(layer.getBounds(), { padding: [50, 50] });
        }
      } catch (err) {
        console.error('GeoJSON load error:', err);
      }
    }

    // Add Save Button Control
    const SaveControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        container.style.backgroundColor = 'white';
        container.style.padding = '5px';
        container.style.cursor = 'pointer';
        container.style.fontWeight = 'bold';
        container.innerHTML = '💾 Simpan Batas Peta';
        
        container.onclick = function(e) {
          L.DomEvent.stopPropagation(e);
          if (!map.pm) return onSaveMap(null);
          const pmLayers = map.pm.getGeomanLayers();
          const features = pmLayers.map(l => l.toGeoJSON());
          let geojsonToSave = null;
          if (features.length > 0) {
            geojsonToSave = features[0].geometry;
          }
          onSaveMap(geojsonToSave);
        };
        return container;
      }
    });
    map.addControl(new SaveControl());

    return () => {
      map.remove();
    };
  }, [zone]);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            📍 Gambar Batas Peta: {zone.name}
          </h3>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: '400px' }}></div>
        </div>
      </div>
    </div>
  );
};

const FeatureFlagsPage = () => {
  const [features, setFeatures] = useState(INITIAL_FEATURES);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', status_text: '' });
  const [editingZone, setEditingZone] = useState(null);
  
  // Geofencing state
  const [activeMapZone, setActiveMapZone] = useState(null);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const [configRes, zonesRes] = await Promise.all([
        supabase.from('feature_flags').select('*').eq('region', 'features_config').maybeSingle(),
        supabase.from('operational_zones').select('*').order('created_at', { ascending: true })
      ]);

      if (configRes.error && configRes.error.code !== 'PGRST116') throw configRes.error;
      if (zonesRes.error) throw zonesRes.error;

      if (configRes.data && Array.isArray(configRes.data.features) && configRes.data.features.length > 0) {
        setFeatures(configRes.data.features);
      }
      
      if (zonesRes.data) {
        setZones(zonesRes.data);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []);

  const handleAddZone = async () => {
    if (!newZone.name) return toast.error('Nama wilayah harus diisi');
    const id = newZone.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (zones.some(z => z.id === id)) return toast.error('Wilayah sudah ada');
    
    const zoneToAdd = {
      id,
      name: newZone.name,
      status_text: newZone.status_text || 'Zona Baru',
      services: { ride: false, food: false, send: false, villa: false, service: false, pay: false, pulsa: false, pool: false },
      is_active: true
    };
    
    try {
      const { error } = await supabase.from('operational_zones').insert([zoneToAdd]);
      if (error) throw error;
      setZones([...zones, zoneToAdd]);
      setShowAddZone(false);
      setNewZone({ name: '', status_text: '' });
      toast.success('Wilayah berhasil ditambahkan.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menambahkan wilayah');
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus wilayah ini?')) return;
    
    try {
      const { error } = await supabase.from('operational_zones').delete().eq('id', zoneId);
      if (error) throw error;
      setZones(zones.filter(z => z.id !== zoneId));
      toast.success('Wilayah berhasil dihapus.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus wilayah');
    }
  };

  const handleUpdateZone = async () => {
    if (!editingZone.name) return toast.error('Nama wilayah harus diisi');
    
    try {
      const { error } = await supabase
        .from('operational_zones')
        .update({
          name: editingZone.name,
          status_text: editingZone.status_text
        })
        .eq('id', editingZone.id);
        
      if (error) throw error;
      
      setZones(zones.map(z => z.id === editingZone.id ? { ...z, name: editingZone.name, status_text: editingZone.status_text } : z));
      setEditingZone(null);
      toast.success('Wilayah berhasil diperbarui.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui wilayah');
    }
  };

  const toggleFeature = (id) => {
    setFeatures(features.map(f => 
      f.id === id ? { ...f, status: !f.status } : f
    ));
  };

  const toggleZoneService = async (zoneId, serviceKey) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    
    const updatedServices = {
      ...zone.services,
      [serviceKey]: !zone.services[serviceKey]
    };
    
    setZones(zones.map(z => z.id === zoneId ? { ...z, services: updatedServices } : z));
    
    try {
      const { error } = await supabase
        .from('operational_zones')
        .update({ services: updatedServices })
        .eq('id', zoneId);
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengubah layanan wilayah');
      fetchFeatures(); // revert on error
    }
  };

  const handleSaveMap = async (geojson) => {
    if (!activeMapZone) return;
    
    try {
      const { error } = await supabase
        .from('operational_zones')
        .update({ geojson: geojson })
        .eq('id', activeMapZone.id);
        
      if (error) throw error;
      
      toast.success('Batas wilayah berhasil disimpan!');
      setZones(zones.map(z => z.id === activeMapZone.id ? { ...z, geojson } : z));
      setActiveMapZone(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan batas wilayah');
    }
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

      toast.success('Konfigurasi fitur global berhasil disimpan ke cloud!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan konfigurasi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {activeMapZone && (
        <MapModal 
          zone={activeMapZone} 
          onClose={() => setActiveMapZone(null)} 
          onSaveMap={handleSaveMap} 
        />
      )}

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
            <Save size={18} /> {saving ? 'Menyimpan...' : 'Simpan Konfigurasi Global'}
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Manajemen Wilayah Operasional</h2>
          <button onClick={() => setShowAddZone(true)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors">
            + Tambah Wilayah
          </button>
        </div>
        
        {showAddZone && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nama Wilayah</label>
              <input type="text" value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})} placeholder="Contoh: Kuta Mandalika" className="w-full px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1">Status / Label</label>
              <input type="text" value={newZone.status_text} onChange={e => setNewZone({...newZone, status_text: e.target.value})} placeholder="Contoh: Zona Wisata" className="w-full px-3 py-2 border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={handleAddZone} className="px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 whitespace-nowrap">Tambah</button>
              <button onClick={() => setShowAddZone(false)} className="px-4 py-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 whitespace-nowrap">Batal</button>
            </div>
          </div>
        )}
        {zones.length === 0 ? (
          <div className="p-6 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {loading ? 'Memuat data wilayah...' : 'Tidak ada data wilayah operasional.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {zones.map((zone) => (
              <div key={zone.id} className="card p-5 bg-white dark:bg-slate-800 shadow rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start">
                  {editingZone?.id === zone.id ? (
                    <div className="w-full flex flex-col gap-2">
                      <input type="text" value={editingZone.name} onChange={e => setEditingZone({...editingZone, name: e.target.value})} className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
                      <input type="text" value={editingZone.status_text} onChange={e => setEditingZone({...editingZone, status_text: e.target.value})} className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-700" />
                      <div className="flex gap-2 justify-end mt-1">
                        <button onClick={handleUpdateZone} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600">Simpan</button>
                        <button onClick={() => setEditingZone(null)} className="px-2 py-1 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded text-xs hover:bg-slate-300">Batal</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{zone.name}</h3>
                        <p className="text-sm text-slate-500 mt-1">{zone.status_text}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingZone(zone)} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors" title="Edit Wilayah">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDeleteZone(zone.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Hapus Wilayah">
                          <Trash2 size={16} />
                        </button>
                        <button 
                          onClick={() => setActiveMapZone(zone)}
                          className="p-1.5 ml-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 text-xs font-medium"
                          title="Gambar Batas Peta"
                        >
                          <MapIcon size={16} /> <span className="hidden sm:inline">Peta</span>
                        </button>
                      </div>
                    </>
                  )}
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
