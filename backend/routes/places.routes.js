const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const supabase = require('../config/supabase');

// Rate limiter for address search: 60 requests/min per IP comfortably covers
// debounced typing while protecting the Google Maps quota from bots.
const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pencarian lokasi, coba sebentar lagi' },
});

// Lombok & Gili Islands bounding box
const LOMBOK_BOUNDS = {
  minLat: -9.10,
  maxLat: -8.10,
  minLng: 115.80,
  maxLng: 116.80,
  centerLat: -8.5833, // Mataram
  centerLng: 116.1167,
  radiusMeters: 55000,
};

const inLombok = (lat, lng) => (
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  lat >= LOMBOK_BOUNDS.minLat &&
  lat <= LOMBOK_BOUNDS.maxLat &&
  lng >= LOMBOK_BOUNDS.minLng &&
  lng <= LOMBOK_BOUNDS.maxLng
);

function getApiKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

/**
 * Try Google Places API (New) first, falling back to Legacy Places Autocomplete
 * if the project only enabled the legacy Places API.
 */
async function googleAutocomplete(query, sessionToken, apiKey) {
  // 1. Places API (New)
  const newRes = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input: query,
      languageCode: 'id',
      regionCode: 'id',
      ...(sessionToken ? { sessionToken: String(sessionToken).slice(0, 64) } : {}),
      locationRestriction: {
        rectangle: {
          low: { latitude: LOMBOK_BOUNDS.minLat, longitude: LOMBOK_BOUNDS.minLng },
          high: { latitude: LOMBOK_BOUNDS.maxLat, longitude: LOMBOK_BOUNDS.maxLng },
        },
      },
    }),
  });

  if (newRes.ok) {
    const data = await newRes.json();
    return (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 6)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text || p.text?.text || '',
        area: p.structuredFormat?.secondaryText?.text || '',
      }))
      .filter((p) => p.placeId && p.name);
  }

  // 2. Fallback to Legacy Places Autocomplete API
  const params = new URLSearchParams({
    input: query,
    key: apiKey,
    language: 'id',
    components: 'country:id',
    location: `${LOMBOK_BOUNDS.centerLat},${LOMBOK_BOUNDS.centerLng}`,
    radius: String(LOMBOK_BOUNDS.radiusMeters),
    strictbounds: 'true',
  });
  if (sessionToken) params.set('sessiontoken', String(sessionToken).slice(0, 64));

  const legRes = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
  if (!legRes.ok) return [];
  const legData = await legRes.json();
  if (legData.status !== 'OK' && legData.status !== 'ZERO_RESULTS') {
    console.warn('Google Places Legacy status:', legData.status, legData.error_message || '');
    return [];
  }
  return (legData.predictions || []).slice(0, 6).map((p) => ({
    placeId: p.place_id,
    name: p.structured_formatting?.main_text || p.description || '',
    area: p.structured_formatting?.secondary_text || '',
  })).filter((p) => p.placeId && p.name);
}

/**
 * Resolve placeId -> { lat, lng, name, address } using minimal field mask
 * (Location Only / Essentials tier) and close the sessionToken.
 */
async function googlePlaceDetails(placeId, sessionToken, apiKey) {
  // 1. Places API (New)
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set('languageCode', 'id');
  if (sessionToken) url.searchParams.set('sessionToken', String(sessionToken).slice(0, 64));

  const newRes = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  });

  if (newRes.ok) {
    const data = await newRes.json();
    const lat = data.location?.latitude;
    const lng = data.location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return {
        lat,
        lng,
        name: data.displayName?.text || '',
        address: data.formattedAddress || '',
      };
    }
  }

  // 2. Fallback to Legacy Place Details API
  const params = new URLSearchParams({
    place_id: placeId,
    key: apiKey,
    language: 'id',
    fields: 'place_id,name,formatted_address,geometry/location',
  });
  if (sessionToken) params.set('sessiontoken', String(sessionToken).slice(0, 64));

  const legRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
  if (!legRes.ok) return null;
  const legData = await legRes.json();
  const loc = legData.result?.geometry?.location;
  if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
    return {
      lat: loc.lat,
      lng: loc.lng,
      name: legData.result?.name || '',
      address: legData.result?.formatted_address || '',
    };
  }
  return null;
}

// GET /api/places/autocomplete?q=...&sessionToken=...
router.get('/autocomplete', placesLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const sessionToken = String(req.query.sessionToken || '').trim();
  if (q.length < 3) {
    return res.json({ suggestions: [] });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.json({ suggestions: [], configured: false });
  }

  try {
    const suggestions = await googleAutocomplete(q, sessionToken, apiKey);
    return res.json({ suggestions, configured: true });
  } catch (err) {
    console.error('places/autocomplete error:', err.message);
    return res.json({ suggestions: [] });
  }
});

// POST /api/places/resolve
// Body: { placeId, sessionToken, name, area, type }
router.post('/resolve', placesLimiter, async (req, res) => {
  const placeId = String(req.body?.placeId || '').trim();
  const sessionToken = String(req.body?.sessionToken || '').trim();
  const fallbackName = String(req.body?.name || '').trim();
  const fallbackArea = String(req.body?.area || '').trim();
  const typeLabel = req.body?.type ? String(req.body.type).trim() : null;

  if (!placeId) {
    return res.status(400).json({ error: 'placeId diperlukan' });
  }

  // 1. Check Supabase cache first (Rp 0 if already resolved before)
  try {
    const { data: cached } = await supabase
      .from('cached_places')
      .select('place_id, name, address, lat, lng, hit_count')
      .eq('place_id', placeId)
      .maybeSingle();

    if (cached && cached.lat != null && cached.lng != null) {
      // Fire-and-forget hit counter increment
      supabase
        .from('cached_places')
        .update({ hit_count: (cached.hit_count || 1) + 1, updated_at: new Date().toISOString() })
        .eq('place_id', placeId)
        .select()
        .then(() => {})
        .catch(() => {});

      return res.json({
        lat: Number(cached.lat),
        lng: Number(cached.lng),
        name: cached.name || fallbackName,
        address: cached.address || fallbackArea,
        cached: true,
      });
    }
  } catch (_) {
    // Table may not exist yet before migration 0139 is applied; continue to Google API
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY belum dikonfigurasi' });
  }

  try {
    const resolved = await googlePlaceDetails(placeId, sessionToken, apiKey);
    if (!resolved || !inLombok(resolved.lat, resolved.lng)) {
      return res.status(404).json({ error: 'Lokasi berada di luar jangkauan Lombok' });
    }

    const finalName = fallbackName || resolved.name;
    const finalAddress = fallbackArea || resolved.address;

    // 2. Save to Supabase cached_places so future searches for this place are free
    try {
      await supabase
        .from('cached_places')
        .upsert({
          place_id: placeId,
          name: finalName,
          address: finalAddress,
          type_label: typeLabel,
          lat: resolved.lat,
          lng: resolved.lng,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'place_id' })
        .select();
    } catch (_) {
      // Ignore if migration 0139 is not applied yet
    }

    return res.json({
      lat: resolved.lat,
      lng: resolved.lng,
      name: finalName,
      address: finalAddress,
      cached: false,
    });
  } catch (err) {
    console.error('places/resolve error:', err.message);
    return res.status(500).json({ error: 'Gagal mengambil titik lokasi' });
  }
});

module.exports = router;
