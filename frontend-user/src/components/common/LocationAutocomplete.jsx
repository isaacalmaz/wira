import { useState, useEffect, useRef } from 'react';
import { MapPin, Bookmark, Store, Home } from 'lucide-react';
import { supabase } from '../../config/supabase';
import API_BASE_URL from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { cx, Spinner } from '../ui';

// 3-Layer Hybrid Place Search for Lombok:
//  1. Layer 1 (Rp 0, instant): Wira's own places — customer's saved addresses,
//     partner restaurants/villas, and `cached_places` (Google Places previously
//     looked up and cached in Supabase).
//  2. Layer 2 (Rp 0, fast): Photon (photon.komoot.io, OpenStreetMap data)
//     bounded to Lombok and the Gilis, ranked from Mataram outwards.
//  3. Layer 3 (Google Places fallback via backend /api/places): called only
//     when Layer 1 + Layer 2 have fewer than 4 strong matches for a 3+ char
//     query. Resolved coordinates are automatically saved to `cached_places`
//     so the next user searching the same warung/gang/kos gets it from Layer 1.
const PHOTON_URL = 'https://photon.komoot.io/api/';
const LOMBOK_BBOX = '115.80,-9.10,116.80,-8.10'; // minLon,minLat,maxLon,maxLat
const BIAS = { lat: -8.5833, lon: 116.1167 }; // Mataram
const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

const cache = new Map();
const googleCache = new Map();
const uniq = (parts) => parts.filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
const makeSessionToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

// OSM type -> short label shown under the name (Indonesian; the map data
// itself is mostly Indonesian too).
const TYPE_LABEL = {
  place_of_worship: 'Tempat ibadah', mosque: 'Masjid', temple: 'Pura', church: 'Gereja',
  restaurant: 'Restoran', cafe: 'Kafe', fast_food: 'Makanan cepat saji', food_court: 'Warung makan', bar: 'Bar',
  hotel: 'Hotel', resort: 'Resor', guest_house: 'Penginapan', hostel: 'Hostel', apartment: 'Penginapan', villa: 'Villa',
  marketplace: 'Pasar', supermarket: 'Supermarket', convenience: 'Minimarket', mall: 'Mal', retail: 'Pertokoan',
  school: 'Sekolah', university: 'Kampus', college: 'Kampus', kindergarten: 'TK',
  hospital: 'Rumah sakit', clinic: 'Klinik', doctors: 'Dokter', pharmacy: 'Apotek', dentist: 'Dokter gigi',
  bank: 'Bank', atm: 'ATM', fuel: 'SPBU', police: 'Polisi', townhall: 'Kantor pemerintah', post_office: 'Kantor pos',
  beach: 'Pantai', viewpoint: 'Tempat wisata', attraction: 'Tempat wisata', park: 'Taman', ferry_terminal: 'Pelabuhan',
  aerodrome: 'Bandara', bus_station: 'Terminal', parking: 'Parkir', office: 'Kantor', company: 'Kantor',
  residential: 'Jalan', living_street: 'Gang', service: 'Jalan', tertiary: 'Jalan', secondary: 'Jalan', primary: 'Jalan', unclassified: 'Jalan',
  village: 'Desa', hamlet: 'Dusun', suburb: 'Kelurahan', neighbourhood: 'Lingkungan', city: 'Kota', town: 'Kota',
};

function fromPhoton(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const street = uniq([p.street, p.housenumber]).join(' ');
  const name = p.name || street || p.district || p.city || p.county;
  const place = uniq([p.name ? street : null, p.district || p.locality, p.city, p.county])
    .filter((x) => x !== name).join(', ');
  const type = TYPE_LABEL[p.osm_value] || null;
  return {
    key: `osm-${p.osm_type}${p.osm_id}`, kind: 'osm', name, lat, lng,
    area: place,
    type,
    isStreet: p.osm_key === 'highway',
  };
}

const matchesAllWords = (name, text) => {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const n = (name || '').toLowerCase();
  return words.length > 0 && words.every((w) => n.split(/[^\p{L}\p{N}]+/u).some((part) => part.startsWith(w)) || n.includes(w));
};

// Photon's own order, nudged: names containing every typed word first, then
// places (mosques, hotels, shops) before streets with a matching name.
function rank(list, text) {
  const score = (s) => (matchesAllWords(s.name, text) ? 2 : 0) + (s.isStreet ? 0 : 1);
  return list.map((s, i) => ({ s, i, k: score(s) })).sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.s);
}

const near = (a, b) => a.lat != null && b.lat != null && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lng - b.lng) < 0.002; // ~200 m

async function searchPhoton(text, signal) {
  const q = text.trim().toLowerCase();
  if (cache.has(q)) return cache.get(q);
  const url = `${PHOTON_URL}?q=${encodeURIComponent(text)}&limit=15&lat=${BIAS.lat}&lon=${BIAS.lon}&bbox=${LOMBOK_BBOX}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const s of rank((data.features || []).map(fromPhoton), text)) {
    if (!s.name || s.lat == null) continue;
    // Same name close by = the same place mapped twice (e.g. hotel + resort tags).
    if (out.some((o) => o.name.toLowerCase() === s.name.toLowerCase() && near(o, s))) continue;
    out.push(s);
    if (out.length >= 8) break;
  }
  cache.set(q, out);
  return out;
}

async function searchPartners(text) {
  const { data } = await supabase
    .from('merchants')
    .select('id, name, address, service_type, lat, lng, listing_status')
    .ilike('name', `%${text.trim().replace(/[%_,()]/g, ' ')}%`)
    .limit(4);
  return (data || [])
    .filter((m) => !['rejected', 'suspended', 'pending'].includes(m.listing_status))
    .map((m) => ({
      key: `m-${m.id}`,
      kind: ['villa', 'WiraVilla'].includes(m.service_type) ? 'villa' : 'merchant',
      name: m.name,
      area: m.address || '',
      lat: m.lat != null ? Number(m.lat) : null,
      lng: m.lng != null ? Number(m.lng) : null,
    }));
}

async function searchCachedPlaces(text) {
  const clean = text.trim().replace(/[%_,()]/g, ' ');
  if (!clean) return [];
  const { data, error } = await supabase
    .from('cached_places')
    .select('place_id, name, address, type_label, lat, lng')
    .ilike('name', `%${clean}%`)
    .order('hit_count', { ascending: false })
    .limit(4);
  if (error || !data) return [];
  return data.map((c) => ({
    key: `cp-${c.place_id}`,
    kind: 'osm',
    placeId: c.place_id,
    name: c.name,
    area: c.address || '',
    type: c.type_label || null,
    lat: c.lat != null ? Number(c.lat) : null,
    lng: c.lng != null ? Number(c.lng) : null,
  }));
}

async function searchGooglePlaces(text, sessionToken, signal) {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return [];
  if (googleCache.has(q)) return googleCache.get(q);
  const url = `${API_BASE_URL}/places/autocomplete?q=${encodeURIComponent(text.trim())}&sessionToken=${encodeURIComponent(sessionToken || '')}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const out = (data.suggestions || []).map((p) => ({
    key: `g-${p.placeId}`,
    kind: 'osm',
    placeId: p.placeId,
    name: p.name,
    area: p.area || '',
    lat: null,
    lng: null,
  }));
  if (out.length > 0) googleCache.set(q, out);
  return out;
}

const KIND_ICON = { saved: Bookmark, merchant: Store, villa: Home, osm: MapPin };

/**
 * Address search with suggestions.
 * `variant`: 'field' (default, matches the UI kit Input) or 'bare' (sunken,
 * borderless, for the ride search card where a pickup/destination marker
 * sits beside it). `icon` + `iconColor` are optional; pass nothing to render
 * the input alone. `label` becomes the input's accessible name.
 * onSelect({ name, fullAddress, lat, lng }) always carries coordinates.
 */
export default function LocationAutocomplete({ placeholder, icon: Icon, iconColor = 'text-ink-muted', value, onChange, onSelect, variant = 'field', label, id }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false);
  const timeoutRef = useRef(null);
  const abortRef = useRef(null);
  const savedRef = useRef(null);
  const sessionTokenRef = useRef(makeSessionToken());
  const listId = `${id || 'loc'}-list`;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => () => {
    clearTimeout(timeoutRef.current);
    abortRef.current?.abort();
  }, []);

  const savedAddresses = async () => {
    if (!user) return [];
    if (!savedRef.current) {
      const { data } = await supabase.from('saved_addresses').select('id, label, address, lat, lng').eq('user_id', user.id);
      savedRef.current = data || [];
    }
    return savedRef.current;
  };

  const searchLocations = async (text) => {
    if (!text || text.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    const needle = text.trim().toLowerCase();
    const osmPromise = searchPhoton(text, ctrl.signal)
      .catch((e) => { if (e.name !== 'AbortError') console.error('Photon error', e); return []; });
    // Layer 1: Wira's own places + cached Google Places answer fast.
    const [saved, partners, cached] = await Promise.all([
      savedAddresses().then((rows) => rows
        .filter((a) => `${a.label} ${a.address}`.toLowerCase().includes(needle))
        .slice(0, 3)
        .map((a) => ({ key: `s-${a.id}`, kind: 'saved', name: a.label, area: a.address, lat: a.lat, lng: a.lng })))
        .catch(() => []),
      searchPartners(text).catch(() => []),
      searchCachedPlaces(text).catch(() => []),
    ]);
    if (ctrl.signal.aborted) return;
    const local = [...saved, ...partners, ...cached];
    if (local.length) {
      setSuggestions(local);
      setActive(-1);
    }
    const osm = await osmPromise;
    if (ctrl.signal.aborted) return;

    const merged = [...local];
    for (const s of osm) {
      if (merged.some((m) => m.name.toLowerCase() === s.name.toLowerCase() && near(m, s))) continue;
      merged.push(s);
    }

    // Layer 3: Only call Google Places if query >= 3 chars and Layer 1 + 2 have
    // fewer than 4 strong matches containing all typed words.
    const strongHits = merged.filter((m) => matchesAllWords(m.name, text)).length;
    if (text.trim().length >= 3 && strongHits < 4) {
      if (merged.length) {
        setSuggestions(merged.slice(0, 10));
        setActive(-1);
      }
      const googleHits = await searchGooglePlaces(text, sessionTokenRef.current, ctrl.signal)
        .catch(() => []);
      if (ctrl.signal.aborted) return;
      for (const g of googleHits) {
        if (merged.some((m) => m.placeId === g.placeId || m.name.toLowerCase() === g.name.toLowerCase())) continue;
        merged.push(g);
      }
    }

    setSuggestions(merged.slice(0, 10));
    setActive(-1);
    setSearched(true);
    setIsLoading(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setShowDropdown(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => searchLocations(val), DEBOUNCE_MS);
  };

  const handleSelect = async (item) => {
    const full = uniq([item.name, item.area]).join(', '); // address text only, no type label
    setQuery(item.name);
    onChange(item.name);
    setShowDropdown(false);
    let { lat, lng } = item;

    // Resolve Google Place ID (and auto-cache it in Supabase for future users)
    if ((lat == null || lng == null) && item.placeId) {
      try {
        const token = sessionTokenRef.current;
        sessionTokenRef.current = makeSessionToken(); // rotate session token after selection
        const res = await fetch(`${API_BASE_URL}/places/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: item.placeId,
            sessionToken: token,
            name: item.name,
            area: item.area,
            type: item.type,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.lat != null && data.lng != null) {
            lat = data.lat;
            lng = data.lng;
          }
        }
      } catch (e) {
        console.error('Google Place resolve error', e);
      }
    }

    // Partners without a pinned location: locate their address (or name).
    if (lat == null || lng == null) {
      try {
        const hit = (await searchPhoton(item.area || item.name))[0]
          || (item.area ? (await searchPhoton(item.name))[0] : null);
        if (hit) ({ lat, lng } = hit);
      } catch (e) {
        console.error('Photon error', e);
      }
    }
    // Still no point: keep the text and let the page geocode it or the user
    // drop the pin (callers expect real coordinates in onSelect).
    if (lat == null || lng == null) {
      onChange(full);
      return;
    }
    onSelect?.({ name: item.name, fullAddress: full, lat: Number(lat), lng: Number(lng) });
  };

  const onKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); handleSelect(suggestions[active]); }
    else if (e.key === 'Escape') setShowDropdown(false);
  };

  const inputCls = variant === 'bare'
    ? 'border-transparent bg-sunken focus:bg-card'
    : 'border-line-strong bg-card';

  const open = showDropdown && query && query.trim().length >= MIN_CHARS && (suggestions.length > 0 || (searched && !isLoading));

  return (
    <div className="relative">
      <div className="relative z-10 flex items-center gap-2.5">
        {Icon && (
          <span className={cx('flex w-6 shrink-0 justify-center', iconColor)} aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            placeholder={placeholder}
            aria-label={label || placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={!!open}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className={cx(
              'block min-h-11 w-full truncate rounded-control border px-3.5 py-2.5 pr-10 text-[14px] text-ink placeholder:text-ink-muted/80 transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20',
              inputCls,
            )}
            value={query}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            onFocus={() => { if (query && query.length >= MIN_CHARS) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)} // delay agar onClick item sempat tereksekusi
          />
          {isLoading && (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-ink">
              <Spinner size={16} />
            </span>
          )}
        </div>
      </div>

      {open && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto overscroll-contain rounded-card border border-line bg-card py-1 shadow-pop">
          {suggestions.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">{t('location.no_results')}</p>
          ) : suggestions.map((item, idx) => {
            const KindIcon = KIND_ICON[item.kind] || MapPin;
            return (
              <button
                key={item.key}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === active}
                type="button"
                className={cx(
                  'flex min-h-11 w-full items-start gap-3 border-b border-line px-3.5 py-3 text-left transition-colors last:border-0 hover:bg-sunken',
                  idx === active && 'bg-sunken',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item)}
              >
                <KindIcon size={17} className={cx('mt-0.5 shrink-0', item.kind === 'osm' ? 'text-ink-muted' : 'text-brand-ink')} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-ink">{item.name}</span>
                    {item.kind !== 'osm' && (
                      <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand-ink">{t(`location.kind_${item.kind}`)}</span>
                    )}
                  </span>
                  {(item.type || item.area) && <span className="line-clamp-2 text-xs leading-snug text-ink-muted">{uniq([item.type, item.area]).join(' · ')}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
