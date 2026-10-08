import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { toast } from 'react-hot-toast';
import { RefreshCw, Sliders, Map as MapIcon, Trash2, Edit, Plus, MapPin, Save } from 'lucide-react';
import { ConfirmModal } from '../components/common/UIComponents';
import { Button, Card, EmptyState, Field, Input, Notice, PageHeader, SectionHeader, Sheet, Stat } from '../components/ui';

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
  { id: 'wira_villa', name: 'WiraVilla (Sewa Villa & Penginapan)', status: true, regions: ['Senggigi', 'Lombok Tengah'] },
  { id: 'wira_service', name: 'WiraService (Jasa Servis & Tukang)', status: true, regions: ['Kota Mataram'] },
  { id: 'wira_pool', name: 'WiraPool (Perawatan Kolam Renang)', status: false, regions: [] },
  { id: 'wira_asuh', name: 'WiraAsuh (Pengasuh Anak)', status: true, regions: [] },
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

    return () => {
      map.remove();
    };
  }, [zone]);

  // Was a Leaflet control inside the map; same logic, now the Sheet footer.
  const handleSaveClick = () => {
    const map = mapInstance.current;
    if (!map) return;
    if (!map.pm) return onSaveMap(null);
    const pmLayers = map.pm.getGeomanLayers();
    const features = pmLayers.map(l => l.toGeoJSON());
    let geojsonToSave = null;
    if (features.length > 0) {
      geojsonToSave = features[0].geometry;
    }
    onSaveMap(geojsonToSave);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Gambar Batas Peta: ${zone.name}`}
      icon={<MapPin size={20} />}
      size="xl"
      className="md:!max-w-5xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button leftIcon={<Save size={17} />} onClick={handleSaveClick}>Simpan Batas Peta</Button>
        </>
      )}
    >
      <div className="relative overflow-hidden rounded-control border border-line">
        <div ref={mapRef} className="h-[60vh] w-full" style={{ minHeight: '400px' }}></div>
      </div>
    </Sheet>
  );
};

// One component, two pages: mode 'features' (service on/off switches the
// customer app reads, HomePage.jsx) and mode 'zones' (operating areas and
// their map boundaries).
const FeatureFlagsPage = ({ mode = 'features' }) => {
  const isZones = mode === 'zones';
  const [features, setFeatures] = useState(INITIAL_FEATURES);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', status_text: '' });
  const [editingZone, setEditingZone] = useState(null);
  const [deleteZoneTarget, setDeleteZoneTarget] = useState(null);
  
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
        // Names come from INITIAL_FEATURES for known keys (the stored copy
        // once called WiraPool a ride-sharing service); saved back on the
        // next toggle.
        const saved = configRes.data.features.map((f) => ({ ...f, name: INITIAL_FEATURES.find((x) => x.id === f.id)?.name || f.name }));
        // Services added after the config was first saved (e.g. WiraAsuh) still get a switch.
        setFeatures([...saved, ...INITIAL_FEATURES.filter((x) => !saved.some((f) => f.id === x.id))]);
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
      services: { ride: false, food: false, send: false, villa: false, service: false, pay: false, pool: false },
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
    // Confirmation now happens in the ConfirmModal (deleteZoneTarget).
    
    try {
      const { error, data } = await supabase.from('operational_zones').delete().eq('id', zoneId).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau wilayah tidak ditemukan.');
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
      const { error, data } = await supabase
        .from('operational_zones')
        .update({
          name: editingZone.name,
          status_text: editingZone.status_text
        })
        .eq('id', editingZone.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau wilayah tidak ditemukan.');

      setZones(zones.map(z => z.id === editingZone.id ? { ...z, name: editingZone.name, status_text: editingZone.status_text } : z));
      setEditingZone(null);
      toast.success('Wilayah berhasil diperbarui.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal memperbarui wilayah');
    }
  };

  // Global service toggles used to only change local state until the
  // separate, visually-distant "Simpan Konfigurasi Global" button was
  // clicked, with no "unsaved changes" indicator anywhere - meaning a
  // toggle here LOOKED identical to the per-zone toggles below (which save
  // immediately) but silently did nothing until that other button was
  // found and clicked. Fixed to save immediately on click, same as
  // toggleZoneService: optimistic local update, persist to
  // feature_flags.features_config right away, and revert + toast on
  // failure. A clear toast on success (naming the feature and new state)
  // replaces the old "Simpan Konfigurasi Global" button, since a global
  // toggle affects the whole city/service and deserves visible confirmation
  // that it actually took effect.
  // Switching a service OFF stops new orders for every customer
  // (migrations/0116), so it is confirmed first; switching on is instant.
  const [offTarget, setOffTarget] = useState(null);
  const requestToggleFeature = (id) => {
    const f = features.find((x) => x.id === id);
    if (f?.status) setOffTarget(f);
    else toggleFeature(id);
  };

  const toggleFeature = async (id) => {
    const updatedFeatures = features.map(f =>
      f.id === id ? { ...f, status: !f.status } : f
    );
    const target = updatedFeatures.find(f => f.id === id);

    setFeatures(updatedFeatures);

    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({
          region: 'features_config',
          features: updatedFeatures,
          updated_at: new Date().toISOString()
        }, { onConflict: 'region' });

      if (error) throw error;
      toast.success(`${target.name} ${target.status ? 'diaktifkan' : 'dinonaktifkan'} untuk seluruh kota.`);
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan perubahan fitur global');
      fetchFeatures(); // revert local state on failure
    }
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
      const { error, data } = await supabase
        .from('operational_zones')
        .update({ services: updatedServices })
        .eq('id', zoneId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak.');
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengubah layanan wilayah');
      fetchFeatures(); // revert on error
    }
  };

  const handleSaveMap = async (geojson) => {
    if (!activeMapZone) return;
    
    try {
      const { error, data } = await supabase
        .from('operational_zones')
        .update({ geojson: geojson })
        .eq('id', activeMapZone.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Akses ditolak atau wilayah tidak ditemukan.');

      toast.success('Batas wilayah berhasil disimpan!');
      setZones(zones.map(z => z.id === activeMapZone.id ? { ...z, geojson } : z));
      setActiveMapZone(null);
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan batas wilayah');
    }
  };

  // Stable close handlers: Sheet re-runs its focus effect when onClose
  // changes, which would pull focus back to the first field on each keystroke.
  const closeAddZone = useCallback(() => setShowAddZone(false), []);
  const closeEditZone = useCallback(() => setEditingZone(null), []);
  const closeMap = useCallback(() => setActiveMapZone(null), []);

  const activeFeatures = features.filter(f => f.status).length;

  return (
    <div className="flex flex-col gap-6">
      {activeMapZone && (
        <MapModal
          zone={activeMapZone}
          onClose={closeMap}
          onSaveMap={handleSaveMap}
        />
      )}

      <PageHeader
        className="!mb-0"
        title={isZones ? 'Wilayah operasi' : 'Fitur layanan'}
        subtitle={isZones ? 'Daftar wilayah dan batas petanya' : 'Nyalakan atau matikan layanan di aplikasi pelanggan, langsung tanpa rilis baru'}
        actions={(
          <Button variant="secondary" onClick={fetchFeatures} aria-label="Muat Ulang" title="Muat Ulang" className="px-3">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!isZones && <Stat
          label="Layanan Global Aktif"
          value={<>{activeFeatures}<span className="text-ink-muted"> / {features.length}</span></>}
          icon={<Sliders size={18} />}
        />}
        {isZones && <Stat label="Wilayah Operasional" value={loading ? '–' : zones.length} icon={<MapPin size={18} />} tone="neutral" />}
      </div>

      {isZones && (
        <Notice tone="info">
          Batas wilayah di sini belum dipakai untuk membatasi pesanan atau pencarian mitra; aplikasi masih melayani seluruh Lombok.
          Gunakan sebagai catatan area operasi sampai fitur pembatasan wilayah dibuat.
        </Notice>
      )}

      {!isZones && <section>
        <SectionHeader title="Layanan Global" />
        <Card padding="none">
          <ul className="divide-y divide-line">
            {features.map((feature) => (
              <li key={feature.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-ink">{feature.name}</span>
                  <span className="font-mono text-[12px] text-ink-muted">Kunci: {feature.id}</span>
                </div>
                <span className={`w-16 text-right text-[12.5px] font-semibold ${feature.status ? 'text-success-ink' : 'text-ink-muted'}`}>
                  {feature.status ? 'Aktif' : 'Nonaktif'}
                </span>
                <Switch
                  checked={!!feature.status}
                  onChange={() => requestToggleFeature(feature.id)}
                  label={feature.name}
                />
              </li>
            ))}
          </ul>
        </Card>
      </section>}

      {isZones && <section>
        <SectionHeader
          title="Manajemen Wilayah Operasional"
          action={(
            <Button size="sm" variant="secondary" leftIcon={<Plus size={15} />} onClick={() => setShowAddZone(true)}>
              Tambah Wilayah
            </Button>
          )}
        />

        {zones.length === 0 ? (
          <EmptyState
            icon={<MapPin size={24} />}
            title={loading ? 'Memuat data wilayah...' : 'Tidak ada data wilayah operasional.'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {zones.map((zone) => (
              <Card key={zone.id} padding="none" className="flex flex-col">
                <div className="flex items-start gap-2 border-b border-line px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="truncate text-[15px] font-bold tracking-tight text-ink">{zone.name}</h3>
                    <p className="truncate text-[12.5px] text-ink-muted">{zone.status_text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" className="px-2" onClick={() => setEditingZone(zone)} title="Edit Wilayah" aria-label="Edit Wilayah">
                      <Edit size={15} />
                    </Button>
                    <Button size="sm" variant="ghost" className="px-2 text-danger-ink hover:bg-danger-soft" onClick={() => setDeleteZoneTarget(zone)} title="Hapus Wilayah" aria-label="Hapus Wilayah">
                      <Trash2 size={15} />
                    </Button>
                    <Button size="sm" variant="secondary" leftIcon={<MapIcon size={15} />} onClick={() => setActiveMapZone(zone)} title="Gambar Batas Peta">
                      Peta
                    </Button>
                  </div>
                </div>
                <ul className="flex-1 divide-y divide-line">
                  {zone.services && Object.keys(zone.services).map((serviceKey) => (
                    <li key={serviceKey} className="flex items-center justify-between gap-3 px-4">
                      <span className="text-[13.5px] font-medium capitalize text-ink">
                        {serviceKey}
                      </span>
                      <Switch
                        checked={!!zone.services[serviceKey]}
                        onChange={() => toggleZoneService(zone.id, serviceKey)}
                        label={`${serviceKey} di ${zone.name}`}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>}

      {/* Tambah wilayah */}
      <Sheet
        open={showAddZone}
        onClose={closeAddZone}
        title="Tambah Wilayah"
        icon={<MapPin size={20} />}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowAddZone(false)}>Batal</Button>
            <Button onClick={handleAddZone}>Tambah</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <Field label="Nama Wilayah" htmlFor="zone-new-name">
            <Input id="zone-new-name" type="text" value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})} placeholder="Contoh: Kuta Mandalika" />
          </Field>
          <Field label="Status / Label" htmlFor="zone-new-status">
            <Input id="zone-new-status" type="text" value={newZone.status_text} onChange={e => setNewZone({...newZone, status_text: e.target.value})} placeholder="Contoh: Zona Wisata" />
          </Field>
        </div>
      </Sheet>

      {/* Edit wilayah */}
      <Sheet
        open={!!editingZone}
        onClose={closeEditZone}
        title="Edit Wilayah"
        icon={<Edit size={20} />}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditingZone(null)}>Batal</Button>
            <Button onClick={handleUpdateZone}>Simpan</Button>
          </>
        )}
      >
        {editingZone && (
          <div className="flex flex-col gap-4">
            <Field label="Nama Wilayah" htmlFor="zone-edit-name">
              <Input id="zone-edit-name" type="text" value={editingZone.name} onChange={e => setEditingZone({...editingZone, name: e.target.value})} />
            </Field>
            <Field label="Status / Label" htmlFor="zone-edit-status">
              <Input id="zone-edit-status" type="text" value={editingZone.status_text} onChange={e => setEditingZone({...editingZone, status_text: e.target.value})} />
            </Field>
          </div>
        )}
      </Sheet>

      <ConfirmModal
        isOpen={!!offTarget}
        tone="danger"
        title={offTarget ? `Matikan ${offTarget.name}?` : ''}
        message="Pelanggan di semua wilayah tidak bisa memesan layanan ini sampai dinyalakan lagi. Pesanan yang sudah berjalan tidak terpengaruh."
        confirmLabel="Matikan"
        onConfirm={() => { const id = offTarget.id; setOffTarget(null); toggleFeature(id); }}
        onCancel={() => setOffTarget(null)}
      />
      <ConfirmModal
        isOpen={!!deleteZoneTarget}
        tone="danger"
        title="Hapus Wilayah"
        message="Apakah Anda yakin ingin menghapus wilayah ini?"
        confirmLabel="Hapus"
        onConfirm={() => { const id = deleteZoneTarget.id; setDeleteZoneTarget(null); handleDeleteZone(id); }}
        onCancel={() => setDeleteZoneTarget(null)}
      />
    </div>
  );
};

// On/off switch: 44px touch area around a compact track.
function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className={`relative inline-flex h-6 w-10 items-center rounded-full border transition-colors ${checked ? 'border-brand bg-brand' : 'border-line-strong bg-sunken'} group-focus-visible:ring-2 group-focus-visible:ring-brand/30`}>
        <span className={`absolute left-0.5 h-[18px] w-[18px] rounded-full bg-card shadow-[0_1px_2px_rgba(6,47,60,0.25)] transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

export default FeatureFlagsPage;
