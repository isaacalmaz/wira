const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { MapContainer, TileLayer, Marker, Polyline, useMap }')) {
    content = content.replace(
        "import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';",
        "import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';"
    );
}

const boundsComponent = `
function MapBounds({ order, driverLoc }) {
  const map = useMap();
  useEffect(() => {
    if (!order) return;
    const bounds = L.latLngBounds([]);
    if (order.pickup_lat && order.pickup_lng) bounds.extend([order.pickup_lat, order.pickup_lng]);
    if (order.dropoff_lat && order.dropoff_lng) bounds.extend([order.dropoff_lat, order.dropoff_lng]);
    if (driverLoc && driverLoc.lat && driverLoc.lng) bounds.extend([driverLoc.lat, driverLoc.lng]);
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [order, driverLoc, map]);
  return null;
}
`;

if (!content.includes('function MapBounds')) {
    content = content.replace("export default function ActiveOrderPage() {", boundsComponent + "\nexport default function ActiveOrderPage() {");
}

const mapRegex = /<MapContainer[^>]*>[\s\S]*?<\/MapContainer>/;
const newMap = `<MapContainer center={driverLoc || [-8.5833, 116.1167]} zoom={14} className="h-full w-full" zoomControl={false}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              <MapBounds order={order} driverLoc={driverLoc} />
              {order.pickup_lat && order.pickup_lng && <Marker position={[order.pickup_lat, order.pickup_lng]} icon={defaultIcon} />}
              {order.dropoff_lat && order.dropoff_lng && <Marker position={[order.dropoff_lat, order.dropoff_lng]} icon={defaultIcon} />}
              {driverLoc && <Marker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon} />}
            </MapContainer>`;

content = content.replace(mapRegex, newMap);

fs.writeFileSync(file, content);
console.log('Patched User Map');
