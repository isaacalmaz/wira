const fs = require('fs');
const path = 'frontend-admin/src/pages/FeatureFlagsPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace MapContent and MapModal entirely with a Vanilla Leaflet version
const vanillaMapCode = `
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
            geojsonToSave = { type: 'FeatureCollection', features };
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
`;

// Remove react-leaflet imports
content = content.replace(/import \{ MapContainer, TileLayer, useMap \} from 'react-leaflet';/g, '');

// Replace MapContent and MapModal
content = content.replace(/const MapContent = \(\{[\s\S]*?const MapModal = \(\{[\s\S]*?return \([\s\S]*?<\/[dD]iv>\s*\);\s*\};/, vanillaMapCode.trim());

// Add React import if not exists
if (!content.includes("import React")) {
  content = content.replace("import { useState", "import React, { useState");
}

fs.writeFileSync(path, content);
console.log('Map rewritten to Vanilla Leaflet!');
