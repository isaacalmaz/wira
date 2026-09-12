const fs = require('fs');
const path = 'frontend-admin/src/pages/FeatureFlagsPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Fix Leaflet Default Icon issue which often crashes maps in React
const iconFix = `
// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
`;

if (!content.includes('delete L.Icon.Default.prototype._getIconUrl')) {
  content = content.replace("const INITIAL_FEATURES", iconFix + "\nconst INITIAL_FEATURES");
}

// Wrap MapContent logic in try/catch to prevent blank screens (crashes)
const newMapContent = `
const MapContent = ({ initialGeojson, onSaveMap }) => {
  const map = useMap();

  useEffect(() => {
    try {
      if (map && map.pm) {
        map.pm.addControls({
          position: 'topleft',
          drawMarker: false,
          drawCircleMarker: false,
          drawPolyline: false,
          drawRectangle: false,
          drawCircle: false,
          drawText: false,
          editMode: true,
          dragMode: true,
          cutPolygon: false,
          removalMode: true,
        });
      }

      if (initialGeojson && Object.keys(initialGeojson).length > 0) {
        const layer = L.geoJSON(initialGeojson).addTo(map);
        if (layer.getBounds().isValid()) {
          map.fitBounds(layer.getBounds(), { padding: [50, 50] });
        }
      }
    } catch (err) {
      console.error('Map init error:', err);
    }

    return () => {
      try {
        if (map && map.pm) map.pm.removeControls();
      } catch(e) {}
    };
  }, [map, initialGeojson]);

  useEffect(() => {
    let saveControl;
    try {
      const handleSave = () => {
        if (!map || !map.pm) return onSaveMap(null);
        const pmLayers = map.pm.getGeomanLayers();
        const features = pmLayers.map(l => l.toGeoJSON());
        let geojsonToSave = null;
        if (features.length > 0) {
          geojsonToSave = {
            type: 'FeatureCollection',
            features: features
          };
        }
        onSaveMap(geojsonToSave);
      };

      const SaveControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
          const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
          const btn = L.DomUtil.create('button', 'px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded', container);
          btn.innerHTML = 'Simpan Batas';
          btn.style.cursor = 'pointer';
          btn.style.pointerEvents = 'auto';
          btn.onclick = function(e) {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e);
            handleSave();
          };
          return container;
        }
      });
      saveControl = new SaveControl();
      map.addControl(saveControl);
    } catch (err) {
      console.error('Save control error:', err);
    }

    return () => {
      try {
        if (saveControl && map) map.removeControl(saveControl);
      } catch(e) {}
    };
  }, [map, onSaveMap]);

  return null;
};
`;

content = content.replace(/const MapContent = \(\{[\s\S]*?return null;\n\};/, newMapContent.trim());

fs.writeFileSync(path, content);
console.log('Map patched!');
