const fs = require('fs');

const path = 'frontend-user/src/components/common/WiraMap.jsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
if (!content.includes('AnimatedMarker')) {
    content = content.replace(
        "import 'leaflet/dist/leaflet.css';",
        "import 'leaflet/dist/leaflet.css';\nimport AnimatedMarker from './AnimatedMarker';"
    );
}

// Replace LeafletMarker with AnimatedMarker for rendering
const replacement = `
        {markers.map((m, idx) => {
          if (!m) return null;
          let icon = pickupIcon;
          if (m.type === 'dropoff') icon = dropoffIcon;
          else if (m.type === 'driver') icon = driverIcon;
          else if (idx === 1) icon = dropoffIcon; // fallback based on index if type not provided
          
          // Use AnimatedMarker for drivers for smooth live tracking, regular marker for static points
          const MarkerComponent = m.type === 'driver' ? AnimatedMarker : LeafletMarker;

          return (
            <MarkerComponent 
              key={idx} 
              position={[m.lat, m.lng]} 
              icon={icon}
              draggable={!!onMarkerDragEnd && m.type !== 'driver'}
              duration={3000} // Smooth 3-second glide for driver GPS updates
              eventHandlers={{
                dragend: (e) => {
                  if (onMarkerDragEnd) {
                    const latLng = e.target.getLatLng();
                    onMarkerDragEnd(idx, { lat: latLng.lat, lng: latLng.lng });
                  }
                }
              }}
            >
              <Popup>{m.label || (idx === 0 ? 'Pickup' : 'Dropoff')}</Popup>
            </MarkerComponent>
          )
        })}
`;

content = content.replace(/\{markers\.map\(\(m, idx\) => \{[\s\S]*?Popup>[\s\S]*?LeafletMarker>[\s\S]*?\)\n\s*\}\)\}/g, replacement.trim());

fs.writeFileSync(path, content);
