export const fetchCoordinates = async (address) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Lombok')}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error('Nominatim error', e);
  }
  return null;
};

export const fetchRoute = async (start, end) => {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      // Leaflet needs [lat, lng]
      return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    }
  } catch (e) {
    console.error('OSRM error', e);
  }
  return null;
};
