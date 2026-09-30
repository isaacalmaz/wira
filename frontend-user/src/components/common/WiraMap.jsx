import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker as LeafletMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import 'leaflet/dist/leaflet.css';
import AnimatedMarker from './AnimatedMarker';
import L from 'leaflet';
import { useTranslation } from '../../i18n';
import { toast } from 'react-hot-toast';

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

// Tenun Laut markers: pickup = brand (laut), destination = danger (bara),
// driver = a solid brand arrow. Colours are semantic classes, so they follow
// the theme; the tile layer is inverted in dark mode, the marker pane is not.
// Shared with ActiveOrderPage so every map uses the same pins.
export const pickupIcon = createIcon(<MapPin strokeWidth={2.2} className="text-brand fill-brand-soft w-8 h-8" />);
export const dropoffIcon = createIcon(<MapPin strokeWidth={2.2} className="text-danger fill-danger-soft w-8 h-8" />);
export const driverIcon = createIcon(<Navigation strokeWidth={1.8} className="text-white fill-brand w-8 h-8 transform rotate-45" />);

// Leaflet mengukur ukuran container-nya sekali saat mount. Jika layout di
// sekitarnya masih berubah bentuk setelah itu (mis. sidebar/topbar baru
// selesai render, transisi flexbox), peta bisa "terjebak" pada lebar lama
// yang lebih sempit - terlihat seperti peta tidak memenuhi lebar penuh
// meski container div-nya sudah full width. invalidateSize() memaksa
// Leaflet mengukur ulang.
const MapResizeFix = () => {
  const map = useMap();

  useEffect(() => {
    const fix = () => map.invalidateSize();
    // Sesaat setelah mount (menunggu layout settle) + setiap resize window.
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
// `locateClassName` positions the floating locate button (e.g. lift it
// above a bottom sheet); defaults to the bottom-right corner.
export default function WiraMap({ center, zoom = 14, markers = [], route = null, onMarkerDragEnd, locateClassName = 'bottom-3 right-3' }) {
  const { t } = useTranslation();
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
          let errorMsg = t('location.failed');
          if (err.code === 1) errorMsg = t('location.denied');
          else if (err.code === 2) errorMsg = t('location.unavailable');
          else if (err.code === 3) errorMsg = t('location.timeout');
          toast.error(errorMsg, { duration: 6000 });
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
              <Popup>
                {/* Leaflet popups are always white, so a fixed dark ink is used here. */}
                <span className="text-[13px] font-semibold text-laut-900">
                  {m.label || (idx === 0 ? t('activity.route_pickup') : t('activity.route_dropoff'))}
                </span>
              </Popup>
            </MarkerComponent>
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
        title={t('common.use_current_location')}
        aria-label={t('common.use_current_location')}
        className={`absolute ${locateClassName} z-10 inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-card text-ink shadow-pop transition-colors hover:bg-sunken`}
      >
        <LocateFixed size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
