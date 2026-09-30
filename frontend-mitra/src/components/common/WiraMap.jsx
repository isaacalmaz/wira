import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker as LeafletMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Custom Icons
const createIcon = (iconComponent) => {
  const iconHtml = renderToString(
    <div className="flex items-center justify-center w-10 h-10 drop-shadow-md">
      {iconComponent}
    </div>
  );
  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 40], // center bottom
    popupAnchor: [0, -40],
  });
};

// Tenun Laut markers (same pins as the customer app): pickup = brand (laut),
// destination = danger (bara), driver = a solid brand arrow. Colours are
// semantic classes, so they follow the theme; the tile layer is inverted in
// dark mode, the marker pane is not.
const pickupIcon = createIcon(<MapPin strokeWidth={2.2} className="text-brand fill-brand-soft w-8 h-8" />);
const dropoffIcon = createIcon(<MapPin strokeWidth={2.2} className="text-danger fill-danger-soft w-8 h-8" />);
const driverIcon = createIcon(<Navigation strokeWidth={1.8} className="text-white fill-brand w-8 h-8 transform rotate-45" />);

// Leaflet mengukur ukuran container-nya sekali saat mount. Jika layout di
// sekitarnya masih berubah bentuk setelah itu (mis. sidebar baru selesai
// render, transisi flexbox), peta bisa "terjebak" pada lebar lama yang
// lebih sempit. invalidateSize() memaksa Leaflet mengukur ulang.
const MapResizeFix = () => {
  const map = useMap();

  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t = setTimeout(fix, 250);
    window.addEventListener('resize', fix);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', fix);
    };
  }, [map]);

  return null;
};

// AutoFitter
const MapAutoFitter = ({ markers, route }) => {
  const map = useMap();
  
  useEffect(() => {
    let bounds = L.latLngBounds([]);
    let hasPoints = false;
    
    if (markers && markers.length > 0) {
      markers.forEach(m => {
        if (m && m.lat && m.lng) {
          bounds.extend([m.lat, m.lng]);
          hasPoints = true;
        }
      });
    }
    
    if (route && route.length > 0) {
      route.forEach(coord => {
        if (coord && coord.length >= 2) {
          bounds.extend([coord[0], coord[1]]);
          hasPoints = true;
        }
      });
    }
    
    if (hasPoints && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 18 });
    }
  }, [markers, route, map]);
  
  return null;
};

// Main Map Component
export default function WiraMap({ center, zoom = 14, markers = [], route = null, onMarkerDragEnd }) {
  const mapCenter = center ? [center.lat, center.lng] : [-8.5833, 116.1167];
  const [mapInstance, setMapInstance] = useState(null);

  const locateUser = () => {
    if (navigator.geolocation && mapInstance) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          mapInstance.flyTo([position.coords.latitude, position.coords.longitude], 19, { animate: true });
        },
        (err) => {
          console.error("Geolocation error:", err);
        }
      );
    }
  };

  return (
    <div className="relative w-full h-full">
      <MapContainer 
        center={mapCenter} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%', zIndex: 0 }} 
        zoomControl={false}
        ref={setMapInstance}
      >
        <MapResizeFix />
        <MapAutoFitter markers={markers} route={route} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {markers.map((m, idx) => {
          if (!m) return null;
          let icon = pickupIcon;
          if (m.type === 'dropoff') icon = dropoffIcon;
          else if (m.type === 'driver') icon = driverIcon;
          else if (idx === 1) icon = dropoffIcon; // fallback based on index if type not provided
          
          return (
            <LeafletMarker 
              key={idx} 
              position={[m.lat, m.lng]} 
              icon={icon}
              draggable={!!onMarkerDragEnd}
              eventHandlers={{
                dragend: (e) => {
                  if (onMarkerDragEnd) {
                    const latLng = e.target.getLatLng();
                    onMarkerDragEnd(idx, { lat: latLng.lat, lng: latLng.lng });
                  }
                }
              }}
            >
              <Popup>
                {/* Leaflet popups are always white, so a fixed dark ink is used here. */}
                <span className="text-[13px] font-semibold text-laut-900">
                  {m.label || (idx === 0 ? 'Pickup' : 'Dropoff')}
                </span>
              </Popup>
            </LeafletMarker>
          )
        })}
        {route && (
          <Polyline positions={route} color="#16788C" weight={5} opacity={0.9} />
        )}
      </MapContainer>
      
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={locateUser}
        title="Lokasi saya"
        aria-label="Lokasi saya"
        className="absolute bottom-6 right-6 z-10 inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-card text-ink shadow-pop transition-colors hover:bg-sunken"
      >
        <LocateFixed size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
