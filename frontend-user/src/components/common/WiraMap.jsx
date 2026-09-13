import React, { useEffect, useState } from 'react';
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

const pickupIcon = createIcon(<MapPin className="text-emerald-500 fill-emerald-100 w-8 h-8" />);
const dropoffIcon = createIcon(<MapPin className="text-red-500 fill-red-100 w-8 h-8" />);
const driverIcon = createIcon(<Navigation className="text-slate-800 fill-yellow-400 w-8 h-8 transform rotate-45" />);

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
          let errorMsg = 'Gagal mendapatkan lokasi.';
          if (err.code === 1) errorMsg = 'Akses lokasi ditolak browser/sistem. Izinkan akses lokasi di pengaturan privasi Anda.';
          else if (err.code === 2) errorMsg = 'Sinyal lokasi tidak tersedia. Coba aktifkan Wi-Fi Anda (Desktop) atau nyalakan GPS (Mobile).';
          else if (err.code === 3) errorMsg = 'Pencarian lokasi timeout.';
          alert(errorMsg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
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
              <Popup>{m.label || (idx === 0 ? 'Pickup' : 'Dropoff')}</Popup>
            </LeafletMarker>
          )
        })}
        {route && (
          <Polyline positions={route} color="#0ea5e9" weight={5} opacity={0.8} />
        )}
      </MapContainer>
      
      {/* Floating Action Button */}
      <button 
        onClick={locateUser}
        className="absolute bottom-6 right-6 z-[1000] bg-white p-3 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors"
      >
        <LocateFixed className="w-6 h-6 text-slate-700" />
      </button>
    </div>
  );
}
