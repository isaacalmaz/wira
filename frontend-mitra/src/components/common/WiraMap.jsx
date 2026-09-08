import React, { useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker as GoogleMarker, DirectionsRenderer } from '@react-google-maps/api';
import { MapContainer, TileLayer, Marker as LeafletMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { AlertCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const libraries = ['places'];
const mapContainerStyle = { width: '100%', height: '100%' };

// Komponen internal untuk mengupdate Leaflet saat props berubah
const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

export default function WiraMap({ center, zoom = 14, markers = [], route = null, onMarkerDragEnd }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  // FALLBACK: 100% GRATIS (OPENSTREETMAP) JIKA API KEY TIDAK ADA
  if (!apiKey) {
    const leafletCenter = center ? [center.lat, center.lng] : [-8.5833, 116.1167];
    
    // Konversi rute jika ada (asumsi format array of [lat, lng] untuk leaflet route)
    const leafletRoute = route && Array.isArray(route) ? route : null;

    return (
      <MapContainer center={leafletCenter} zoom={zoom} style={{ height: '100%', width: '100%', zIndex: 0 }} zoomControl={false}>
        <MapUpdater center={leafletCenter} zoom={zoom} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {markers.map((m, idx) => (
          <LeafletMarker 
            key={idx} 
            position={[m.lat, m.lng]} 
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
            <Popup>{idx === 0 ? 'Lokasi Penjemputan (Bisa digeser)' : 'Tujuan'}</Popup>
          </LeafletMarker>
        ))}
        {leafletRoute && (
          <Polyline positions={leafletRoute} color="#0ea5e9" weight={4} opacity={0.8} />
        )}
      </MapContainer>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-500 p-4 text-center">
        <AlertCircle size={40} className="mb-2" />
        <p className="font-semibold">Gagal memuat Google Maps</p>
        <p className="text-xs mt-1">Pastikan API Key valid dan domain diizinkan.</p>
      </div>
    );
  }

  if (!isLoaded) return <div className="w-full h-full bg-slate-200 animate-pulse"></div>;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      options={{ disableDefaultUI: true, zoomControl: false }}
    >
      {!route && markers.map((m, idx) => (
        <GoogleMarker key={idx} position={m} />
      ))}
      
      {route && (
        <DirectionsRenderer directions={route} options={{ suppressMarkers: false }} />
      )}
    </GoogleMap>
  );
}
