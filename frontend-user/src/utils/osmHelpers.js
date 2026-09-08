export const fetchCoordinates = async (address) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&viewbox=115.8,-8.2,116.6,-9.0&countrycodes=id&limit=1`);
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
      const route = data.routes[0];
      return {
        coordinates: route.geometry.coordinates.map(c => [c[1], c[0]]), // Leaflet needs [lat, lng]
        distance: route.distance, // in meters
        duration: route.duration  // in seconds
      };
    }
  } catch (e) {
    console.error('OSRM error', e);
  }
  return null;
};
