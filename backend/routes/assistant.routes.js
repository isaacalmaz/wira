const express = require('express');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const router = express.Router();
const supabase = require('../config/supabase');

// Rate limiter: 40 requests/min per IP to prevent spam while keeping chat snappy
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan pesan. Tunggu sebentar.' },
});

// Domain Lexicons for Intent Scoring
const INTENT_PATTERNS = {
  ride: [
    'ride', 'ojek', 'taksi', 'taxi', 'motor', 'mobil', 'jemput', 'antar', 'anterin', 'tumpangan',
    'bonceng', 'jalan-jalan', 'keliling', 'bandara', 'airport', 'lop', 'senggigi',
    'praya', 'pantai', 'selong belanak', 'tanjung aan', 'mandalika', 'transport', 'transportasi', 'go',
    'pesankan', 'pesan ojek', 'pesan mobil', 'pesan motor', 'pesan kendaraan', 'pergi ke', 'berangkat ke'
  ],
  food: [
    'makan', 'food', 'kuliner', 'lapar', 'laper', 'taliwang', 'puyung', 'ayam', 'ikan', 'seafood',
    'nasi', 'sate', 'plecing', 'kangkung', 'resto', 'restoran', 'warung', 'cafe', 'kopi', 'nongkrong',
    'sarapan', 'maksi', 'dinner', 'ngemil', 'jajan', 'minum', 'kenyang', 'hangat', 'pedas', 'pedes',
    'pesen makan', 'pesan makan', 'keroncongan'
  ],
  send: [
    'send', 'kirim', 'paket', 'dokumen', 'barang', 'titip', 'ekspedisi', 'antar paket', 'kurir'
  ],
  villa: [
    'villa', 'vilal', 'vila', 'nginep', 'inap', 'hotel', 'homestay', 'resort', 'tidur', 'staycation',
    'stay', 'kamar', 'private pool', 'ocean view', 'sewa villa', 'booking villa', 'penginapan'
  ],
  excavator: [
    'excavator', 'ekskavator', 'bego', 'alat berat', 'ratain tanah', 'timbun', 'urug', 'proyek',
    'pondasi', 'pengerukan', 'gali'
  ],
  pool: [
    'kolam', 'pool', 'kuras', 'air keruh', 'air hijau', 'lumut', 'kaporit', 'chlorine', 'vacuum',
    'perawatan kolam', 'maintenance kolam', 'kuras kolam', 'bersihin kolam'
  ],
  bersih: [
    'sampah', 'buang sampah', 'angkut sampah', 'bersih', 'bersihin', 'housekeeping', 'kotor',
    'sampun bersih', 'sampun', 'pembuangan', 'kebersihan villa', 'sapu', 'turnover'
  ],
  service: [
    'ac', 'cuci ac', 'ac panas', 'ac bocor', 'pipa', 'listrik', 'rusak', 'benerin', 'servis',
    'service', 'teknisi', 'tukang', 'kulkas', 'pompa air'
  ],
  asuh: [
    'babysitter', 'asuh', 'jaga anak', 'titip anak', 'pengasuh', 'suster', 'balita', 'baby', 'nanny'
  ],
  tracking: [
    'order', 'pesanan', 'status', 'lacak', 'posisi', 'driver', 'sudah sampai mana', 'kapan sampai',
    'cek order', 'cek pesanan'
  ],
  payment: [
    'bayar', 'pembayaran', 'qris', 'tunai', 'cash', 'cara bayar', 'batal', 'cancel', 'bantuan', 'cs', 'wirapay', 'saldo'
  ]
};

// Known Lombok landmark coordinate mappings
const LOMBOK_LOCATIONS = {
  'bandara internasional lombok': { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  'bandara lombok': { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  bandara: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  lop: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  airport: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  bil: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  'batu samban': { name: 'Dusun Batu Samban, Pengembur, Pujut, Lombok Tengah', lat: -8.8180, lng: 116.2620 },
  bencot: { name: 'Pengembur Bencot, Pujut, Lombok Tengah', lat: -8.8160, lng: 116.2640 },
  pengembur: { name: 'Desa Pengembur, Pujut, Lombok Tengah', lat: -8.8150, lng: 116.2650 },
  pujut: { name: 'Pujut, Lombok Tengah', lat: -8.8250, lng: 116.2750 },
  sade: { name: 'Desa Sade, Pujut, Lombok Tengah', lat: -8.8392, lng: 116.2922 },
  rembitan: { name: 'Rembitan, Pujut, Lombok Tengah', lat: -8.8390, lng: 116.2920 },
  sengkol: { name: 'Sengkol, Pujut, Lombok Tengah', lat: -8.8050, lng: 116.2900 },
  'kua pujut': { name: 'Kantor Urusan Agama (KUA) Pujut, Sengkol, Lombok Tengah', lat: -8.8055, lng: 116.2905 },
  'kantor kua pujut': { name: 'Kantor Urusan Agama (KUA) Pujut, Sengkol, Lombok Tengah', lat: -8.8055, lng: 116.2905 },
  'kantor urusan agama pujut': { name: 'Kantor Urusan Agama (KUA) Pujut, Sengkol, Lombok Tengah', lat: -8.8055, lng: 116.2905 },
  'kantor urusan agama kecamatan pujut': { name: 'Kantor Urusan Agama (KUA) Pujut, Sengkol, Lombok Tengah', lat: -8.8055, lng: 116.2905 },
  'kantor camat pujut': { name: 'Kantor Camat Pujut, Sengkol, Lombok Tengah', lat: -8.8060, lng: 116.2910 },
  'camat pujut': { name: 'Kantor Camat Pujut, Sengkol, Lombok Tengah', lat: -8.8060, lng: 116.2910 },
  'puskesmas sengkol': { name: 'Puskesmas Sengkol, Pujut, Lombok Tengah', lat: -8.8052, lng: 116.2912 },
  'puskesmas pujut': { name: 'Puskesmas Sengkol, Pujut, Lombok Tengah', lat: -8.8052, lng: 116.2912 },
  'pasar sengkol': { name: 'Pasar Sengkol, Pujut, Lombok Tengah', lat: -8.8040, lng: 116.2920 },
  'polsek pujut': { name: 'Polsek Pujut, Sengkol, Lombok Tengah', lat: -8.8065, lng: 116.2900 },
  'koramil pujut': { name: 'Koramil Pujut, Sengkol, Lombok Tengah', lat: -8.8058, lng: 116.2898 },
  'tanak awu': { name: 'Tanak Awu, Pujut (Area Bandara LOP)', lat: -8.7615, lng: 116.2755 },
  penujak: { name: 'Penujak, Praya Barat, Lombok Tengah', lat: -8.7350, lng: 116.2350 },
  praya: { name: 'Praya, Lombok Tengah', lat: -8.7067, lng: 116.2800 },
  'praya barat': { name: 'Praya Barat, Lombok Tengah', lat: -8.7800, lng: 116.1800 },
  'praya timur': { name: 'Praya Timur, Lombok Tengah', lat: -8.7300, lng: 116.3500 },
  kopang: { name: 'Kopang, Lombok Tengah', lat: -8.6350, lng: 116.3550 },
  jonggat: { name: 'Jonggat, Lombok Tengah', lat: -8.6850, lng: 116.2350 },
  mataram: { name: 'Kota Mataram', lat: -8.5833, lng: 116.1167 },
  ampenan: { name: 'Ampenan, Kota Mataram', lat: -8.5750, lng: 116.0850 },
  cakranegara: { name: 'Cakranegara, Kota Mataram', lat: -8.5900, lng: 116.1300 },
  gerung: { name: 'Gerung, Lombok Barat', lat: -8.6850, lng: 116.1250 },
  lembar: { name: 'Pelabuhan Lembar, Lombok Barat', lat: -8.7280, lng: 116.0720 },
  kediri: { name: 'Kediri, Lombok Barat', lat: -8.6450, lng: 116.1650 },
  narmada: { name: 'Narmada, Lombok Barat', lat: -8.6015, lng: 116.2050 },
  senggigi: { name: 'Pantai Senggigi, Lombok Barat', lat: -8.5042, lng: 116.0505 },
  bangsal: { name: 'Pelabuhan Bangsal, Pemenang, Lombok Utara', lat: -8.4010, lng: 116.1040 },
  pemenang: { name: 'Pemenang, Lombok Utara', lat: -8.4050, lng: 116.1050 },
  tanjung: { name: 'Tanjung, Lombok Utara', lat: -8.3550, lng: 116.1550 },
  senaru: { name: 'Senaru, Gunung Rinjani, Lombok Utara', lat: -8.2980, lng: 116.4050 },
  sembalun: { name: 'Sembalun, Lombok Timur', lat: -8.3600, lng: 116.5250 },
  selong: { name: 'Selong, Lombok Timur', lat: -8.6500, lng: 116.5350 },
  masbagik: { name: 'Masbagik, Lombok Timur', lat: -8.6250, lng: 116.4750 },
  aikmel: { name: 'Aikmel, Lombok Timur', lat: -8.5650, lng: 116.5350 },
  sekotong: { name: 'Sekotong, Lombok Barat', lat: -8.7650, lng: 116.0150 },
  tawun: { name: 'Pelabuhan Tawun, Sekotong', lat: -8.7450, lng: 115.9950 },
  'selong belanak': { name: 'Pantai Selong Belanak, Lombok Barat', lat: -8.8683, lng: 116.1600 },
  mawun: { name: 'Pantai Mawun, Lombok Tengah', lat: -8.9030, lng: 116.2280 },
  'pantai mawun': { name: 'Pantai Mawun, Lombok Tengah', lat: -8.9030, lng: 116.2280 },
  'soma house kuta': { name: 'Soma House, Jl. Mawun, Kuta Lombok', lat: -8.8890, lng: 116.2690 },
  'soma house': { name: 'Soma House, Jl. Mawun, Kuta Lombok', lat: -8.8890, lng: 116.2690 },
  soma: { name: 'Soma House, Jl. Mawun, Kuta Lombok', lat: -8.8890, lng: 116.2690 },
  'the social yard': { name: 'The Social Yard, Jl. Pariwisata Kuta, Lombok', lat: -8.8912, lng: 116.2818 },
  'social yard': { name: 'The Social Yard, Jl. Pariwisata Kuta, Lombok', lat: -8.8912, lng: 116.2818 },
  'mana yoga': { name: 'Mana Yoga & Eco Retreat, Kuta Lombok', lat: -8.8910, lng: 116.2820 },
  mana: { name: 'Mana Yoga & Eco Retreat, Kuta Lombok', lat: -8.8910, lng: 116.2820 },
  'el bazar': { name: 'El Bazar Cafe & Restaurant, Kuta Lombok', lat: -8.8928, lng: 116.2801 },
  'bush radio': { name: 'Bush Radio, Kuta Lombok', lat: -8.8935, lng: 116.2795 },
  nalua: { name: 'Nalua Surf & Coffee, Kuta Lombok', lat: -8.8930, lng: 116.2805 },
  'pantai tanjung aan': { name: 'Pantai Tanjung Aan, Lombok Tengah', lat: -8.9100, lng: 116.3210 },
  'tanjung aan': { name: 'Pantai Tanjung Aan, Lombok Tengah', lat: -8.9100, lng: 116.3210 },
  'pantai selong belanak': { name: 'Pantai Selong Belanak, Lombok Barat', lat: -8.8683, lng: 116.1600 },
  kuta: { name: 'Pusat Kuta Lombok', lat: -8.8905, lng: 116.2805 },
  'pantai kuta': { name: 'Pantai Kuta Mandalika, Lombok', lat: -8.8975, lng: 116.2785 },
  mandalika: { name: 'Pertamina Mandalika International Circuit', lat: -8.8920, lng: 116.3050 },
  'villa talas': { name: 'Villa Talas, Kuta Lombok', lat: -8.8970, lng: 116.2840 },
  ashtari: { name: 'Ashtari Lounge, Kuta Lombok', lat: -8.9012, lng: 116.2731 },
  kenza: { name: 'Kenza Cafe, Jl. Raya Kuta, Lombok', lat: -8.8925, lng: 116.2805 },
  gerupuk: { name: 'Pantai Gerupuk (Surfing Spot), Lombok Tengah', lat: -8.9220, lng: 116.3350 },
  'batu payung': { name: 'Batu Payung, Lombok Tengah', lat: -8.9150, lng: 116.3280 },
  'bukit merese': { name: 'Bukit Merese, Pujut, Lombok Tengah', lat: -8.9120, lng: 116.3190 },
  'gili trawangan': { name: 'Gili Trawangan, Lombok Utara', lat: -8.3500, lng: 116.0380 },
  'gili air': { name: 'Gili Air, Lombok Utara', lat: -8.3600, lng: 116.0820 },
  'gili meno': { name: 'Gili Meno, Lombok Utara', lat: -8.3520, lng: 116.0580 },
  rektorat: { name: 'Rektorat Universitas Mataram, Jl. Majapahit, Mataram', lat: -8.5901, lng: 116.0964 },
  unram: { name: 'Universitas Mataram, Mataram', lat: -8.5901, lng: 116.0964 },
  epicentrum: { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  default: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
};

function isSelfLocationQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /tempat saya|lokasi saya|posisi saya|titik saya|posisi saat ini|lokasi saat ini|lokasi sekarang|posisi sekarang|lokasi terkini|titik jemput|rumah saya|^rumah$|kost saya|^kost$|villa saya|jemput saya|di sini|dari sini|^sini$|my location|current location|my place|^here$|from here|pickup here/i.test(t);
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 5;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, R * c);
}

function calculateRideFare(distKm, isCar = false) {
  const basePrice = isCar ? 25000 : 12000;
  const perKmRate = isCar ? 5000 : 3000;
  const extraKm = Math.max(0, distKm - 2);
  return Math.ceil((basePrice + Math.ceil(extraKm * perKmRate)) / 500) * 500;
}

async function getOsmRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const distKm = parseFloat((data.routes[0].distance / 1000).toFixed(1));
        const durationMins = Math.ceil(data.routes[0].duration / 60);
        return { distKm, durationMins, source: 'osrm' };
      }
    }
  } catch (_) {
    // network timeout fallback
  }

  // Calibrated road winding factor for Lombok terrain (road is ~1.15x straight line)
  const crowKm = calculateDistanceKm(lat1, lon1, lat2, lon2);
  const distKm = parseFloat((crowKm * 1.15).toFixed(1));
  const durationMins = Math.max(3, Math.ceil(distKm * 1.5));
  return { distKm, durationMins, source: 'calibrated' };
}

function resolveLombokLocation(text, dbContext = {}) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();
  const userLoc = dbContext.userCurrentLocation || dbContext.userLocation;
  const savedAddrs = dbContext.savedAddresses || [];

  // 1. Direct self-location reference ("tempat saya", "lokasi saya", "sini", etc.)
  if (isSelfLocationQuery(lower)) {
    if (userLoc && userLoc.lat && userLoc.lng) {
      return {
        name: userLoc.address ? userLoc.address : 'Lokasi Anda Saat Ini',
        lat: Number(userLoc.lat),
        lng: Number(userLoc.lng),
        isUserLocation: true,
      };
    }
    if (savedAddrs.length > 0) {
      const primary = savedAddrs.find((a) => a.is_primary) || savedAddrs[0];
      return {
        name: primary.address,
        lat: Number(primary.lat || -8.8955),
        lng: Number(primary.lng || 116.2780),
        isUserLocation: true,
      };
    }
    if (dbContext.userLastOrderLocation && dbContext.userLastOrderLocation.lat && dbContext.userLastOrderLocation.lng) {
      return {
        name: dbContext.userLastOrderLocation.name || dbContext.userLastOrderLocation.address || 'Lokasi Terakhir Anda',
        lat: Number(dbContext.userLastOrderLocation.lat),
        lng: Number(dbContext.userLastOrderLocation.lng),
        isUserLocation: true,
      };
    }
    return {
      name: 'Lokasi Anda Saat Ini',
      lat: -8.8955,
      lng: 116.2780,
      isUserLocation: true,
    };
  }

  // 2. Check if text matches current GPS location address
  if (userLoc && userLoc.address && userLoc.lat && userLoc.lng) {
    const uAddr = userLoc.address.toLowerCase();
    if (lower === uAddr || lower.includes(uAddr) || uAddr.includes(lower)) {
      return {
        name: userLoc.address,
        lat: Number(userLoc.lat),
        lng: Number(userLoc.lng),
        isUserLocation: true,
      };
    }
  }

  // 3. Check if text matches any saved addresses (by label or address substring)
  for (const s of savedAddrs) {
    const sAddr = (s.address || '').toLowerCase();
    const sLabel = (s.label || '').toLowerCase();
    if ((sAddr && (lower === sAddr || lower.includes(sAddr) || sAddr.includes(lower))) ||
        (sLabel && (lower === sLabel || lower.includes(sLabel)))) {
      return {
        name: s.address,
        lat: Number(s.lat || -8.8955),
        lng: Number(s.lng || 116.2780),
        isSavedAddress: true,
      };
    }
  }

  // 4. Check known Lombok landmarks & subdistricts (longest match first)
  const GENERIC_AREAS = new Set(['kuta', 'mataram', 'praya', 'senggigi', 'lombok', 'selong', 'tanjung', 'ampenan', 'cakranegara']);
  const sortedEntries = Object.entries(LOMBOK_LOCATIONS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, loc] of sortedEntries) {
    if (key !== 'default' && lower.includes(key)) {
      if (GENERIC_AREAS.has(key)) {
        // If the user provided a more specific venue name along with the generic area
        // (e.g. "Soma House Kuta", "Villa Senang Kuta"), preserve the specific venue title!
        const remaining = lower.replace(key, '').replace(/di|ke|dari|jalan|jl\.?|daerah|area/g, '').trim();
        if (remaining.length > 2) {
          const formattedVenue = text.trim()
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          return { name: formattedVenue, lat: loc.lat, lng: loc.lng };
        }
      }
      return { name: loc.name, lat: loc.lat, lng: loc.lng };
    }
  }

  // 5. If unknown, preserve the user's provided place name cleanly
  const formattedCustom = text.trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  if (userLoc && userLoc.lat && userLoc.lng) {
    return { name: formattedCustom, lat: Number(userLoc.lat), lng: Number(userLoc.lng) };
  }

  return { name: formattedCustom, lat: LOMBOK_LOCATIONS.default.lat, lng: LOMBOK_LOCATIONS.default.lng };
}

function resolveIsoDate(text, offsetDays = 1) {
  if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Calculate scores for each intent
function detectIntents(queryLower) {
  const scores = {};
  for (const [domain, keywords] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;
    for (const kw of keywords) {
      if (queryLower.includes(kw)) {
        score += (kw.length > 5 ? 3 : 1);
      }
    }
    if (score > 0) scores[domain] = score;
  }

  // Domain priority disambiguation:
  if (queryLower.match(/kuras|keruh|hijau|lumut|kaporit|chlorine|vacuum|kolam/i)) {
    scores.pool = (scores.pool || 0) + 10;
  }
  if (queryLower.match(/sampah|buang sampah|angkut sampah|sampun|bersih villa|housekeeping/i)) {
    scores.bersih = (scores.bersih || 0) + 10;
  }
  if (queryLower.match(/excavator|ekskavator|bego|alat berat/i)) {
    scores.excavator = (scores.excavator || 0) + 10;
  }
  if (queryLower.match(/baby\s*sitter|babysitter|asuh|balita|nanny/i)) {
    scores.asuh = (scores.asuh || 0) + 10;
  }
  if (queryLower.match(/cuci ac|servis ac|servis|service|pipa|listrik|teknisi|tukang/i)) {
    scores.service = (scores.service || 0) + 10;
  }
  if (queryLower.match(/kirim|paket|dokumen|ekspedisi|kurir/i)) {
    scores.send = (scores.send || 0) + 10;
  }
  if (queryLower.match(/makan|lapar|laper|taliwang|puyung|kuliner|resto|restoran/i)) {
    scores.food = (scores.food || 0) + 10;
  }
  if (queryLower.match(/villa|vila|nginep|hotel|homestay|staycation/i) && !scores.pool && !scores.bersih) {
    scores.villa = (scores.villa || 0) + 10;
  }
  if (queryLower.match(/ojek|taksi|motor|mobil|jemput|antar/i) && !scores.send && !scores.food) {
    scores.ride = (scores.ride || 0) + 10;
  }

  // Natural ride patterns: moving between locations or booking transport
  const hasTravelPattern = (
    /(?:pesan(?:kan)?|order|carikan|cari)\s+(?:kendaraan|tumpangan|transport)?\s*(?:dari\s+.+\s+ke\s+|ke\s+)/i.test(queryLower) ||
    /(?:antar(?:kan)?|anterin|bawa|jemput|jemputin)\s+(?:saya|kami)?\s*(?:dari\s+.+\s+ke\s+|ke\s+)/i.test(queryLower) ||
    /(?:mau|ingin|butuh)\s+(?:pergi\s+ke|berangkat\s+ke|ke|menuju)\s+/i.test(queryLower) ||
    /(?:dari\s+.+\s+(?:ke|menuju)\s+)/i.test(queryLower) ||
    /^(?:ke|menuju)\s+[a-zA-Z0-9\s]+$/i.test(queryLower)
  );

  const hasConflictingService = Boolean(
    scores.send || scores.food || scores.villa || scores.pool || scores.bersih || scores.service || scores.excavator || scores.asuh
  );

  if (hasTravelPattern && !hasConflictingService) {
    scores.ride = (scores.ride || 0) + 15;
  }

  return scores;
}

// Helper: Query real database context for AI
async function fetchDbContext(queryLower, userId, detectedIntents) {
  const context = {
    villas: [],
    restaurants: [],
    activeOrders: [],
    savedAddresses: [],
    userCurrentLocation: null,
  };

  try {
    // 1. Fetch Villas
    if (detectedIntents.villa) {
      const stopWords = new Set(['villa', 'vila', 'cari', 'yang', 'dengan', 'pantai', 'inap', 'nginep', 'sewa', 'booking', 'rekomendasi', 'lombok', 'kuta']);
      const words = queryLower.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w));
      for (const w of words) {
        const { data: specific } = await supabase
          .from('merchants')
          .select('id, name, address, rating, price_per_night, photos')
          .eq('service_type', 'villa')
          .ilike('name', `%${w}%`)
          .limit(2);
        if (specific && specific.length > 0) {
          context.villas = specific.map((v) => ({
            id: v.id,
            name: v.name,
            address: v.address || 'Kuta Lombok',
            rating: v.rating || 4.9,
            pricePerNight: v.price_per_night || 850000,
            image: v.photos?.[0] || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
          }));
          break;
        }
      }

      if (context.villas.length === 0) {
        const { data: villas } = await supabase
          .from('merchants')
          .select('id, name, address, rating, price_per_night, photos')
          .eq('service_type', 'villa')
          .eq('listing_status', 'approved')
          .limit(3);
        if (villas && villas.length > 0) {
          context.villas = villas.map((v) => ({
            id: v.id,
            name: v.name,
            address: v.address || 'Kuta Lombok',
            rating: v.rating || 4.9,
            pricePerNight: v.price_per_night || 750000,
            image: v.photos?.[0] || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
          }));
        }
      }
    }

    // 2. Fetch Food / Restaurants
    if (detectedIntents.food) {
      const foodStopWords = new Set(['makan', 'food', 'kuliner', 'lapar', 'laper', 'ayam', 'ikan', 'nasi', 'resto', 'restoran', 'warung', 'kuta', 'lombok']);
      const foodWords = queryLower.split(/\s+/).filter((w) => w.length > 3 && !foodStopWords.has(w));
      for (const w of foodWords) {
        const { data: specificFood } = await supabase
          .from('merchants')
          .select('id, name, address, rating, image, photos, is_open, category')
          .eq('service_type', 'food')
          .ilike('name', `%${w}%`)
          .limit(2);
        if (specificFood && specificFood.length > 0) {
          context.restaurants = specificFood.map((f) => ({
            id: f.id,
            name: f.name,
            address: f.address || 'Lombok',
            rating: f.rating || 4.8,
            category: f.category || 'Kuliner Khas Lombok',
            image: f.image || f.photos?.[0] || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          }));
          break;
        }
      }

      if (context.restaurants.length === 0) {
        const { data: foods } = await supabase
          .from('merchants')
          .select('id, name, address, rating, image, photos, is_open, category')
          .eq('service_type', 'food')
          .eq('listing_status', 'approved')
          .limit(3);

        if (foods && foods.length > 0) {
          context.restaurants = foods.map((f) => ({
            id: f.id,
            name: f.name,
            address: f.address || 'Lombok',
            rating: f.rating || 4.8,
            category: f.category || 'Kuliner Khas Lombok',
            image: f.image || f.photos?.[0] || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
          }));
        }
      }
    }

    // 3. Fetch active orders
    if (userId && (detectedIntents.tracking || queryLower.includes('order') || queryLower.includes('pesanan'))) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, service_type, status, driver_id, title, details, created_at')
        .eq('user_id', userId)
        .not('status', 'in', '("completed","cancelled","canceled")')
        .order('created_at', { ascending: false })
        .limit(2);

      if (orders && orders.length > 0) {
        context.activeOrders = orders;
      }
    }

    // 4. Fetch User Saved Addresses (Rumah, Kantor, Kost, Villa) for address resolution
    if (userId) {
      const { data: addresses } = await supabase
        .from('saved_addresses')
        .select('id, label, address, lat, lng, is_primary, note')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })
        .limit(5);

      if (addresses && addresses.length > 0) {
        context.savedAddresses = addresses;
      }
    }

    // 5. Fetch User's Last Known Order Location (for reliable self-location if GPS is off)
    if (userId) {
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('title, details, pickup_lat, pickup_lng')
        .eq('user_id', userId)
        .not('pickup_lat', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentOrders && recentOrders.length > 0) {
        // Look for a non-airport/transit pickup address first (e.g. home/villa/neighborhood)
        const bestOrder = recentOrders.find((ord) => {
          let orig = '';
          try {
            const d = typeof ord.details === 'object' ? ord.details : JSON.parse(ord.details || '{}');
            orig = (d && d.origin) || ord.title || '';
          } catch (_) {}
          return !/bandara|airport|pelabuhan|terminal/i.test(orig);
        }) || recentOrders[0];

        if (bestOrder && bestOrder.pickup_lat && bestOrder.pickup_lng) {
          let addrName = 'Lokasi Riwayat Penjemputan';
          try {
            const d = typeof bestOrder.details === 'object' ? bestOrder.details : JSON.parse(bestOrder.details || '{}');
            if (d && d.origin) addrName = d.origin;
          } catch (_) {}

          const resolvedCoords = resolveLombokLocation(addrName);
          const lat = resolvedCoords?.lat || Number(bestOrder.pickup_lat);
          const lng = resolvedCoords?.lng || Number(bestOrder.pickup_lng);

          context.userLastOrderLocation = {
            name: addrName,
            address: addrName,
            lat,
            lng,
          };
          if (!context.userCurrentLocation) {
            context.userCurrentLocation = context.userLastOrderLocation;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching AI context from DB:', err.message);
  }

  return context;
}

// 8 Gemini Function Declarations for All Active Services
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'draftRideBooking',
        description: 'Draft a ride hailing booking for WiraRide (motorcycle or car ride hailing in Lombok). ALWAYS call this tool when the user asks for travel, transport, or natural phrases like "pesankan dari [A] ke [B]", "pesankan ke [B]", "antar saya ke [B]", "mau ke [B]".',
        parameters: {
          type: 'OBJECT',
          properties: {
            vehicleType: { type: 'STRING', enum: ['motor', 'car', 'mobil'], description: 'Vehicle type (motor / car)' },
            origin: { type: 'STRING', description: 'Pickup location or address in Lombok' },
            destination: { type: 'STRING', description: 'Destination address in Lombok' },
            notes: { type: 'STRING', description: 'Special instructions or departure time' }
          },
          required: ['origin', 'destination']
        }
      },
      {
        name: 'draftFoodOrder',
        description: 'Draft a food delivery order on WiraFood from a local restaurant or culinary merchant in Lombok',
        parameters: {
          type: 'OBJECT',
          properties: {
            restaurantName: { type: 'STRING', description: 'Name of the restaurant or eatery' },
            items: { type: 'STRING', description: 'Food items and portions requested (e.g. 2 porsi Ayam Taliwang)' },
            deliveryAddress: { type: 'STRING', description: 'Delivery address in Lombok' },
            notes: { type: 'STRING', description: 'Special culinary requests (e.g. level pedas)' }
          },
          required: ['items']
        }
      },
      {
        name: 'draftSendBooking',
        description: 'Draft a package or parcel delivery order on WiraSend in Lombok',
        parameters: {
          type: 'OBJECT',
          properties: {
            packageType: { type: 'STRING', description: 'Type or description of items being sent (e.g. Dokumen, Makanan, Barang)' },
            packageSize: { type: 'STRING', enum: ['kecil', 'sedang', 'besar'], description: 'Package size' },
            origin: { type: 'STRING', description: 'Pickup address in Lombok' },
            destination: { type: 'STRING', description: 'Dropoff address in Lombok' },
            recipientName: { type: 'STRING', description: 'Recipient name' },
            recipientPhone: { type: 'STRING', description: 'Recipient phone' },
            notes: { type: 'STRING', description: 'Notes for courier' }
          },
          required: ['origin', 'destination']
        }
      },
      {
        name: 'draftVillaBooking',
        description: 'Draft a private villa reservation on WiraVilla in Lombok',
        parameters: {
          type: 'OBJECT',
          properties: {
            villaName: { type: 'STRING', description: 'Name of the villa in Lombok' },
            nights: { type: 'INTEGER', description: 'Number of nights stay' },
            checkInDate: { type: 'STRING', description: 'Check-in date or timeframe' },
            guests: { type: 'INTEGER', description: 'Number of guests' },
            notes: { type: 'STRING', description: 'Special requests (e.g. private pool, airport pick)' }
          },
          required: ['villaName']
        }
      },
      {
        name: 'draftBersihBooking',
        description: 'Draft an order for WiraBersih (Sampun Bersih waste management or villa housekeeping in Lombok)',
        parameters: {
          type: 'OBJECT',
          properties: {
            subType: { type: 'STRING', enum: ['sampah', 'housekeeping'], description: 'Service type: sampah (waste management) or housekeeping (villa cleaning)' },
            address: { type: 'STRING', description: 'Villa or location address in Lombok' },
            date: { type: 'STRING', description: 'Requested service date' },
            time: { type: 'STRING', description: 'Requested time' },
            notes: { type: 'STRING', description: 'Details or special instructions' }
          },
          required: ['subType']
        }
      },
      {
        name: 'draftPoolBooking',
        description: 'Draft a swimming pool maintenance, water testing, or cleaning order for WiraPool in Lombok',
        parameters: {
          type: 'OBJECT',
          properties: {
            serviceCategory: { type: 'STRING', description: 'Type of maintenance: kuras, vacuum, chemical balancing, water testing' },
            address: { type: 'STRING', description: 'Villa or location address' },
            date: { type: 'STRING', description: 'Requested date' },
            notes: { type: 'STRING', description: 'Pool condition or size' }
          }
        }
      },
      {
        name: 'draftServiceBooking',
        description: 'Draft a technician repair or heavy equipment excavator rental on WiraService in Lombok',
        parameters: {
          type: 'OBJECT',
          properties: {
            serviceCategory: { type: 'STRING', enum: ['ac', 'listrik', 'pipa', 'excavator', 'lainnya'], description: 'Category of technician or equipment' },
            problemDescription: { type: 'STRING', description: 'Description of problem or equipment needed' },
            address: { type: 'STRING', description: 'Location address' },
            date: { type: 'STRING', description: 'Requested date or schedule' },
            notes: { type: 'STRING', description: 'Additional notes' }
          },
          required: ['serviceCategory']
        }
      },
      {
        name: 'draftAsuhBooking',
        description: 'Draft a babysitter or nanny childcare booking for WiraAsuh in Lombok. Call this tool when user asks to find or book a babysitter or nanny (e.g. "cari baby sitter jagain balita", "pesan babysitter 4 jam").',
        parameters: {
          type: 'OBJECT',
          properties: {
            careType: { type: 'STRING', description: 'Type of childcare (babysitter, nanny, jaga balita)' },
            childrenCount: { type: 'INTEGER', description: 'Number of children' },
            durationHours: { type: 'INTEGER', description: 'Duration in hours' },
            address: { type: 'STRING', description: 'Location in Lombok' },
            date: { type: 'STRING', description: 'Date or schedule' },
            notes: { type: 'STRING', description: 'Notes or preferences' }
          }
        }
      }
    ]
  }
];

// Helper to construct structured draft widget from tool call
async function buildDraftFromToolCall(toolName, args, dbContext, lang = 'id', queryLower = '') {
  const isEn = lang === 'en';
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let draft = null;
  let reply = '';

  switch (toolName) {
    case 'draftRideBooking': {
      const isCar = args.vehicleType === 'car' || args.vehicleType === 'mobil';
      let originRaw = (args.origin || '').trim();
      let destRaw = (args.destination || '').trim();
      const isPlaceholder = /belum|unknown|tbd|tidak tahu|tidak ada/i.test(originRaw + ' ' + destRaw);

      // Check if user asked for pickup at their own location in their query
      const userAskedSelfLocation = queryLower && isSelfLocationQuery(queryLower) && !/(?:dari|jemput di)\s+(?!tempat|lokasi|sini|rumah|kost|villa)[a-zA-Z0-9\s]+/i.test(queryLower);
      const isSelfOrigin = !originRaw || isPlaceholder || isSelfLocationQuery(originRaw) || userAskedSelfLocation;

      let originLoc = null;
      if (isSelfOrigin) {
        if (dbContext.userCurrentLocation && dbContext.userCurrentLocation.lat && dbContext.userCurrentLocation.lng) {
          originLoc = {
            name: dbContext.userCurrentLocation.address || 'Lokasi Anda Saat Ini',
            lat: Number(dbContext.userCurrentLocation.lat),
            lng: Number(dbContext.userCurrentLocation.lng),
            isUserLocation: true,
          };
          originRaw = originLoc.name;
        } else if (dbContext.savedAddresses && dbContext.savedAddresses.length > 0) {
          const primary = dbContext.savedAddresses.find((a) => a.is_primary) || dbContext.savedAddresses[0];
          originLoc = {
            name: primary.address,
            lat: Number(primary.lat || -8.8955),
            lng: Number(primary.lng || 116.2780),
            isUserLocation: true,
          };
          originRaw = originLoc.name;
        } else if (dbContext.userLastOrderLocation && dbContext.userLastOrderLocation.lat && dbContext.userLastOrderLocation.lng) {
          originLoc = {
            name: dbContext.userLastOrderLocation.name || dbContext.userLastOrderLocation.address || 'Lokasi Terakhir Anda',
            lat: Number(dbContext.userLastOrderLocation.lat),
            lng: Number(dbContext.userLastOrderLocation.lng),
            isUserLocation: true,
          };
          originRaw = originLoc.name;
        } else {
          originLoc = {
            name: 'Lokasi Anda Saat Ini (Kuta Lombok)',
            lat: -8.8955,
            lng: 116.2780,
            isUserLocation: true,
          };
          originRaw = originLoc.name;
        }
      }

      if (!destRaw || isPlaceholder || destRaw.toLowerCase() === originRaw.toLowerCase()) {
        destRaw = originRaw.toLowerCase().includes('pantai kuta')
          ? 'Bandara Internasional Lombok (LOP)'
          : 'Pantai Kuta Mandalika, Lombok';
      }

      if (!originLoc) {
        originLoc = resolveLombokLocation(originRaw, dbContext);
      }
      let destLoc = resolveLombokLocation(destRaw, dbContext);

      if (!originLoc) {
        if (dbContext.userCurrentLocation?.lat && dbContext.userCurrentLocation?.lng) {
          originLoc = {
            name: originRaw || dbContext.userCurrentLocation.address || 'Lokasi Anda Saat Ini',
            lat: Number(dbContext.userCurrentLocation.lat),
            lng: Number(dbContext.userCurrentLocation.lng),
            isUserLocation: true,
          };
        } else {
          originLoc = { name: originRaw, lat: -8.8955, lng: 116.2780 };
        }
      }
      if (!destLoc) {
        destLoc = { name: destRaw, lat: -8.7615, lng: 116.2755 };
      }

      if (originLoc.name === destLoc.name || (Math.abs(originLoc.lat - destLoc.lat) < 0.0005 && Math.abs(originLoc.lng - destLoc.lng) < 0.0005)) {
        if (destLoc.name.toLowerCase().includes('kuta') || originLoc.name.toLowerCase().includes('kuta')) {
          destLoc = { name: 'Bukit Merese, Pujut, Lombok Tengah', lat: -8.9120, lng: 116.3190 };
        } else {
          destLoc = { name: 'Pantai Kuta Mandalika, Lombok', lat: -8.8975, lng: 116.2785 };
        }
      }

      const routeInfo = await getOsmRouteDistance(originLoc.lat, originLoc.lng, destLoc.lat, destLoc.lng);
      const distKm = routeInfo.distKm;
      const durationMins = routeInfo.durationMins;
      const motorPrice = calculateRideFare(distKm, false);
      const carPrice = calculateRideFare(distKm, true);
      const priceEstimate = isCar ? carPrice : motorPrice;
      const vName = isCar ? (isEn ? 'WiraRide (Car)' : 'WiraRide (Mobil)') : (isEn ? 'WiraRide (Motor)' : 'WiraRide (Motor)');

      const routeUrl = `/ride?pickup=${encodeURIComponent(originLoc.name)}&pickupLat=${originLoc.lat}&pickupLng=${originLoc.lng}&dropoff=${encodeURIComponent(destLoc.name)}&dropoffLat=${destLoc.lat}&dropoffLng=${destLoc.lng}&vehicle=${isCar ? 'mobil' : 'motor'}`;

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'ride',
        serviceName: vName,
        title: `${isEn ? 'Ride Booking' : 'Pesan Ojek/Mobil'}: ${originLoc.name} ➔ ${destLoc.name}`,
        subtitle: isEn ? `Verified local driver pickup (${distKm} km • ~${durationMins} mins)` : `Mitra driver lokal terdekat siap menjemput (${distKm} km • ~${durationMins} mnt)`,
        details: {
          origin: originLoc.name,
          destination: destLoc.name,
          vehicleType: isCar ? 'car' : 'motor',
          distanceKm: distKm,
          durationMins,
          motorPrice,
          carPrice,
          routeUrl,
          date: isEn ? 'Today' : 'Hari ini',
          time: isEn ? 'Now' : 'Sekarang',
          notes: args.notes || (isEn ? 'Immediate pickup' : 'Jemput sekarang'),
          originCoords: { lat: originLoc.lat, lng: originLoc.lng },
          destCoords: { lat: destLoc.lat, lng: destLoc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `I have drafted your ${vName} ride from ${originLoc.name} to ${destLoc.name} (${distKm} km, ~${durationMins} mins). Fare: Rp ${priceEstimate.toLocaleString('id-ID')} (matches Ride Portal). Confirm below or open on map!`
        : `Saya sudah menyiapkan draf pesanan ${vName} dari ${originLoc.name} menuju ${destLoc.name} (${distKm} km, ~${durationMins} mnt) dengan tarif Rp ${priceEstimate.toLocaleString('id-ID')} (sesuai tarif resmi portal WiraRide). Silakan periksa rincian di bawah dan tekan konfirmasi untuk memesan langsung!`;
      break;
    }

    case 'draftFoodOrder': {
      let itemsRaw = (args.items || '').trim();
      const isPlaceholder = !itemsRaw || /belum|unknown|tbd|pilihan/i.test(itemsRaw);
      if (isPlaceholder) {
        itemsRaw = '2 Porsi Ayam Taliwang Bakar + Plecing Kangkung';
      }

      const restoName = args.restaurantName || (dbContext.restaurants?.[0]?.name || 'Ayam Taliwang Bu Mirah');
      const matchedResto = dbContext.restaurants?.find((r) =>
        r.name.toLowerCase().includes(restoName.toLowerCase()) ||
        restoName.toLowerCase().includes(r.name.toLowerCase())
      ) || dbContext.restaurants?.[0];
      const merchantId = matchedResto?.id || null;

      let deliveryAddress = args.deliveryAddress || '';
      if (!deliveryAddress) {
        if (dbContext.userCurrentLocation && dbContext.userCurrentLocation.address) {
          deliveryAddress = dbContext.userCurrentLocation.address;
        } else if (dbContext.savedAddresses && dbContext.savedAddresses.length > 0) {
          const primary = dbContext.savedAddresses.find((a) => a.is_primary) || dbContext.savedAddresses[0];
          deliveryAddress = primary.address;
        } else {
          deliveryAddress = 'Kuta Lombok';
        }
      }

      const destLoc = resolveLombokLocation(deliveryAddress, dbContext) || { name: deliveryAddress, lat: -8.8955, lng: 116.2780 };
      const priceEstimate = 55000;

      draft = {
        type: 'booking_draft',
        draftId,
        merchantId,
        serviceType: 'food',
        serviceName: 'WiraFood',
        title: `Pesan WiraFood: ${restoName}`,
        subtitle: isEn ? 'Hot culinary delivery to your doorstep' : 'Pesanan makanan siap diantar driver terdekat ke lokasi Anda',
        details: {
          merchantId,
          merchantName: restoName,
          items: itemsRaw,
          destination: destLoc.name,
          notes: args.notes || 'Antar hangat',
          destCoords: { lat: destLoc.lat, lng: destLoc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `I drafted your WiraFood order from ${restoName} (${itemsRaw}). Estimated total is Rp ${priceEstimate.toLocaleString('id-ID')}. Check the draft below and confirm to dispatch!`
        : `Draf pesanan WiraFood Anda dari ${restoName} (${itemsRaw}) telah siap dengan estimasi total Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi di bawah untuk langsung memesan!`;
      break;
    }

    case 'draftSendBooking': {
      let originRaw = (args.origin || '').trim();
      let destRaw = (args.destination || '').trim();
      if (!originRaw) {
        originRaw = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';
      }
      if (!destRaw || destRaw.toLowerCase() === originRaw.toLowerCase()) {
        destRaw = 'Kota Mataram';
      }

      const originLoc = resolveLombokLocation(originRaw, dbContext) || { name: originRaw, lat: -8.8955, lng: 116.2780 };
      const destLoc = resolveLombokLocation(destRaw, dbContext) || { name: destRaw, lat: -8.5833, lng: 116.1167 };
      const validSizes = ['dokumen', 'kecil', 'sedang', 'besar', 'mobil'];
      const rawSize = (args.packageSize || 'kecil').toLowerCase();
      const size = validSizes.includes(rawSize) ? rawSize : 'kecil';
      const priceEstimate = size === 'mobil' ? 120000 : (size === 'besar' ? 65000 : (size === 'sedang' ? 30000 : 15000));

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'send',
        serviceName: 'WiraSend',
        title: `Kirim Paket WiraSend: ${originLoc.name} ➔ ${destLoc.name}`,
        subtitle: isEn ? 'Fast on-demand courier in Lombok' : 'Kurir instan kilat dan aman ke seluruh Lombok',
        details: {
          origin: originLoc.name,
          destination: destLoc.name,
          packageType: args.packageType || 'Dokumen / Paket Kilat',
          packageSize: size,
          recipientName: args.recipientName || 'Penerima di lokasi',
          notes: args.notes || 'Hati-hati bawa paket',
          originCoords: { lat: originLoc.lat, lng: originLoc.lng },
          destCoords: { lat: destLoc.lat, lng: destLoc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `WiraSend courier draft created from ${originLoc.name} to ${destLoc.name}. Estimated delivery cost is Rp ${priceEstimate.toLocaleString('id-ID')}. Confirm below to dispatch your driver!`
        : `Draf pengiriman WiraSend dari ${originLoc.name} ke ${destLoc.name} sudah siap. Estimasi ongkir Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi kartu di bawah untuk mencari kurir!`;
      break;
    }

    case 'draftVillaBooking': {
      const villaName = args.villaName || (dbContext.villas?.[0]?.name || 'Villa Segara Kuta Lombok');
      const matchedVilla = dbContext.villas?.find((v) =>
        v.name.toLowerCase().includes(villaName.toLowerCase()) ||
        villaName.toLowerCase().includes(v.name.toLowerCase())
      ) || dbContext.villas?.[0];
      const merchantId = matchedVilla?.id || null;
      const nights = Number(args.nights) || 2;
      const ratePerNight = matchedVilla?.pricePerNight || 850000;
      const priceEstimate = nights * ratePerNight;
      const checkInIso = resolveIsoDate(args.checkInDate, 1);
      const checkOutIso = resolveIsoDate(args.checkInDate, 1 + nights);

      draft = {
        type: 'booking_draft',
        draftId,
        merchantId,
        serviceType: 'villa',
        serviceName: 'WiraVilla',
        title: `Reservasi WiraVilla: ${villaName}`,
        subtitle: isEn ? 'Private villa with private pool & ocean view' : 'Villa privat eksklusif dengan fasilitas private pool di Lombok',
        details: {
          merchantId,
          villaName,
          nights,
          checkInDate: checkInIso,
          checkOutDate: checkOutIso,
          displayDate: args.checkInDate || (isEn ? 'Upcoming check-in' : 'Besok / Sesuai jadwal'),
          guests: Number(args.guests) || 2,
          notes: args.notes || 'Konfirmasi reservasi instan',
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `I have drafted your reservation for ${villaName} (${nights} night${nights > 1 ? 's' : ''}). Estimated total is Rp ${priceEstimate.toLocaleString('id-ID')}. Tap below to finalize your booking!`
        : `Saya sudah menyiapkan draf pemesanan ${villaName} untuk ${nights} malam. Total estimasi adalah Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan periksa rincian dan konfirmasi di bawah!`;
      break;
    }

    case 'draftBersihBooking': {
      const isHousekeeping = args.subType === 'housekeeping' || /housekeeping|turnover|kamar|bersih villa/i.test(queryLower);
      const addr = args.address || dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';
      const loc = resolveLombokLocation(addr, dbContext) || { name: addr, lat: -8.8955, lng: 116.2780 };
      const priceEstimate = isHousekeeping ? 150000 : 45000;
      const label = isHousekeeping ? 'Housekeeping Villa (Turnover)' : 'Pengangkutan Sampah (Sampun Bersih)';

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'bersih',
        serviceName: 'WiraBersih (Sampun Bersih)',
        title: `Layanan WiraBersih: ${label}`,
        subtitle: isEn ? 'Eco-friendly waste management & villa cleaning' : 'Pengangkutan sampah rutin & kebersihan villa ramah lingkungan Kuta Lombok',
        details: {
          subType: isHousekeeping ? 'housekeeping' : 'sampah',
          address: loc.name,
          date: args.date || (isEn ? 'Scheduled as requested' : 'Besok pagi'),
          time: args.time || 'Pagi / Jam kerja',
          notes: args.notes || 'Layanan terverifikasi Sampun Bersih',
          destCoords: { lat: loc.lat, lng: loc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `Draft for WiraBersih (${label}) has been prepared at ${loc.name}. Cost: Rp ${priceEstimate.toLocaleString('id-ID')}. Confirm below to lock in the schedule!`
        : `Draf pesanan WiraBersih (${label}) untuk lokasi ${loc.name} telah disiapkan dengan tarif Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi untuk menjadwalkan petugas!`;
      break;
    }

    case 'draftPoolBooking': {
      const addr = args.address || dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Villa Kuta Lombok';
      const loc = resolveLombokLocation(addr, dbContext) || { name: addr, lat: -8.8955, lng: 116.2780 };
      const priceEstimate = 150000;

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'pool',
        serviceName: 'WiraPool',
        title: 'Perawatan & Kuras Kolam Renang (WiraPool)',
        subtitle: isEn ? 'Water testing, tile vacuum, & chemical balancing' : 'Pembersihan lumut, vacuum, dan penyeimbangan kadar air & kaporit/pH',
        details: {
          serviceCategory: args.serviceCategory || 'Perawatan Kolam Villa Rutin & Kuras',
          address: loc.name,
          date: args.date || (isEn ? 'Scheduled visit' : 'Kunjungan teknisi hari ini/besok'),
          notes: args.notes || 'Pengecekan kualitas air dan vacuum kolam',
          destCoords: { lat: loc.lat, lng: loc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `Your WiraPool maintenance request for ${loc.name} is ready for confirmation. Visit fee: Rp ${priceEstimate.toLocaleString('id-ID')}. Tap below to book!`
        : `Draf perawatan kolam renang WiraPool di ${loc.name} telah siap dengan estimasi biaya Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi draf di bawah!`;
      break;
    }

    case 'draftServiceBooking': {
      const isExcavator = args.serviceCategory === 'excavator' || /excavator|ekskavator|bego|alat berat/i.test(queryLower);
      const category = isExcavator ? 'excavator' : (args.serviceCategory || 'ac');
      const addr = args.address || dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || (isExcavator ? 'Praya, Lombok Tengah' : 'Kuta Lombok');
      const loc = resolveLombokLocation(addr, dbContext) || { name: addr, lat: isExcavator ? -8.7000 : -8.8955, lng: isExcavator ? 116.2800 : 116.2780 };
      const priceEstimate = isExcavator ? 250000 : 85000;
      const title = isExcavator ? 'Sewa Excavator Mini PC-50 (WiraService)' : `Servis Teknisi ${category.toUpperCase()} (WiraService)`;

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'service',
        serviceName: 'WiraService',
        title,
        subtitle: isExcavator
          ? (isEn ? 'Heavy equipment with certified operator & fuel' : 'Alat berat lengkap operator & solar untuk proyek lahan Lombok')
          : (isEn ? 'Certified technician for AC, electrical, or plumbing' : 'Teknisi terverifikasi untuk perbaikan rumah dan villa'),
        details: {
          serviceCategory: category,
          problemDescription: args.problemDescription || (isExcavator ? 'Sewa Excavator Mini PC-50' : 'Servis & Cuci AC Villa'),
          address: loc.name,
          date: args.date || (isEn ? 'Scheduled' : 'Besok pagi'),
          notes: args.notes || 'Mitra teknisi profesional terverifikasi',
          destCoords: { lat: loc.lat, lng: loc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `I have prepared your WiraService booking (${title}) at ${loc.name}. Rate: Rp ${priceEstimate.toLocaleString('id-ID')}. Check the details below and confirm to order!`
        : `Draf pemesanan WiraService (${title}) di ${loc.name} sudah disiapkan dengan estimasi biaya Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan periksa dan tekan tombol konfirmasi!`;
      break;
    }

    case 'draftAsuhBooking': {
      const addr = args.address || dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';
      const loc = resolveLombokLocation(addr, dbContext) || { name: addr, lat: -8.8955, lng: 116.2780 };
      const hours = Number(args.durationHours) || 4;
      const priceEstimate = hours * 50000;

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'babysit',
        serviceName: 'WiraAsuh',
        title: `Pesan WiraAsuh: Babysitter & Pengasuh Anak (${hours} Jam)`,
        subtitle: isEn ? 'Verified caring nanny directly to your villa or home' : 'Pengasuh anak terpercaya dan tersertifikasi datang langsung ke villa/rumah',
        details: {
          careType: args.careType || 'Pengasuh Balita / Babysitter Harian',
          durationHours: hours,
          childrenCount: Number(args.childrenCount) || 1,
          address: loc.name,
          date: args.date || (isEn ? 'Today / Scheduled' : 'Hari ini / Sesuai jadwal'),
          notes: args.notes || 'Pengasuh ramah dan berpengalaman',
          destCoords: { lat: loc.lat, lng: loc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `WiraAsuh childcare draft is ready for ${loc.name} (${hours} hours). Total fee: Rp ${priceEstimate.toLocaleString('id-ID')}. Confirm below to request your babysitter!`
        : `Draf pemesanan WiraAsuh untuk ${hours} jam di ${loc.name} telah siap dengan total Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi di bawah untuk memanggil babysitter!`;
      break;
    }

    default:
      break;
  }

  return { draft, reply };
}

// POST /api/assistant/chat
router.post('/chat', assistantLimiter, async (req, res) => {
  try {
    const { message, query: bodyQuery, userId, lang = 'id', userLocation, savedAddresses: clientSavedAddresses } = req.body;
    const rawMessage = message || bodyQuery;
    if (!rawMessage || typeof rawMessage !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const query = rawMessage.trim();
    const queryLower = query.toLowerCase();
    const detectedIntents = detectIntents(queryLower);
    const dbContext = await fetchDbContext(queryLower, userId, detectedIntents);

    if (userLocation) {
      dbContext.userCurrentLocation = userLocation;
    }
    if (clientSavedAddresses && clientSavedAddresses.length > 0 && (!dbContext.savedAddresses || dbContext.savedAddresses.length === 0)) {
      dbContext.savedAddresses = clientSavedAddresses;
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

    // If Gemini API Key is available, call Google Gemini Flash with Tool Calling
    if (apiKey) {
      try {
        const systemPrompt = `You are "Wira AI Assistant", an expert local concierge and booking assistant for the Wira Super-App in Lombok, Indonesia.
Wira provides hands-free ordering across all 8 active services:
1. WiraRide: motorbike & car ride hailing in Lombok (Kuta, Bandara LOP, Mataram, Senggigi, etc.). Note: payments are Cash & QRIS (WiraPay wallet is deactivated).
2. WiraFood: food delivery for local culinary favorites (Ayam Taliwang, Nasi Balap Puyung, seafood).
3. WiraSend: on-demand parcel and package courier.
4. WiraVilla: private villa rentals with private pools and ocean views in Lombok.
5. WiraBersih: villa housekeeping and routine waste management (Sampun Bersih in Kuta Lombok).
6. WiraPool: swimming pool maintenance, water testing & chemical balance.
7. WiraService: technician repairs (AC repair, plumbing, electrical) and Excavator / Heavy Equipment rental in Lombok.
8. WiraAsuh: trusted babysitter and nanny services for homes and villas.

CRITICAL INSTRUCTIONS ON INSTANT IN-CHAT DRAFTING:
- The user requires that EVERYTHING is rendered directly in the chat as an interactive Booking Draft Card, so they only need to tap "Konfirmasi & Pesan Sekarang" without opening other app pages or filling forms manually.
- Whenever the user asks to book, order, or expresses intent for ANY of the 8 services (even if broad like "mau makan", "pesen ojek", "mau ke kuta", "sewa villa", "kuras kolam", "angkut sampah", "panggil teknisi", "sewa excavator", "cari babysitter", "kirim paket"), ALWAYS CALL THE CORRESPONDING DRAFT TOOL!
- Natural phrasing for travel like 'pesankan dari [A] ke [B]', 'pesankan ke [B]', 'antar ke [B]', 'bawa saya ke [B]', 'mau ke [B]' without mention of food/goods/villas MUST IMMEDIATELY trigger 'draftRideBooking'! For example: 'pesankan dari tempat saya ke kua pujut' -> call draftRideBooking with origin: 'tempat saya', destination: 'KUA Pujut'.
- Local Lombok landmarks such as 'kua pujut' (Kantor Urusan Agama Kecamatan Pujut, Sengkol, Lombok Tengah), 'kantor camat pujut', 'pasar sengkol', 'puskesmas sengkol', 'pantai kuta', 'bukit merese' must be recognized and mapped accurately.
- Fill in sensible, top-rated defaults from Lombok and dbContext for any unspecified parameters (e.g. default food: Ayam Taliwang Bu Mirah, default villa: Villa Segara Kuta Lombok, default ride: pickup from user location/GPS to requested destination or Pantai Kuta, default clean: Sampun Bersih, default pool: Kuras & Perawatan Kolam, default service: Servis AC / Excavator, default nanny: 4 jam Kuta Lombok).
- If the user says "dari tempat saya", "lokasi saya", "sini", "ke rumah saya":
  * Set origin as "Current Location" or the real address in dbContext.userCurrentLocation / dbContext.userLastOrderLocation / dbContext.savedAddresses. NEVER substitute Bandara Internasional Lombok (LOP) unless the user explicitly requested airport!
  * Note geographic reality: user location coordinates in dbContext determine exact geodesic and road distance. For instance, Pengembur / Pujut / Praya is only ~7 km from Bandara Internasional Lombok (LOP), NOT 15 km. Keep origin and destination faithful to user GPS and saved addresses.
- Never tell the user to open other app pages or fill manual forms. Always output the draft so they can confirm with 1 tap.
- Always be warm, friendly, concise, and helpful.

Database Context available right now:
${JSON.stringify(dbContext)}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nUser Question: ${query}` }],
              },
            ],
            tools: GEMINI_TOOLS,
            generationConfig: {
              maxOutputTokens: 600,
              temperature: 0.7,
            },
          }),
        });

        if (response.ok) {
          const geminiData = await response.json();
          const parts = geminiData.candidates?.[0]?.content?.parts || [];
          const functionCallPart = parts.find((p) => p.functionCall)?.functionCall;
          const textPart = parts.find((p) => p.text)?.text;

          // If Gemini generated a Tool Call, convert it into an interactive Booking Draft Widget
          if (functionCallPart && functionCallPart.name) {
            const { draft, reply } = await buildDraftFromToolCall(
              functionCallPart.name,
              functionCallPart.args || {},
              dbContext,
              lang,
              queryLower
            );
            if (draft) {
              return res.json({
                success: true,
                reply: textPart || reply,
                widgets: [draft],
              });
            } else if (reply) {
              return res.json({
                success: true,
                reply,
                widgets: buildWidgets(queryLower, dbContext, detectedIntents),
              });
            }
          }

          // Otherwise return natural conversational response with contextual widgets
          if (textPart) {
            const localResult = await generateLocalResponse(query, queryLower, lang, dbContext, detectedIntents);
            const hasDraftWidget = localResult.widgets && localResult.widgets.some((w) => w.type === 'booking_draft');
            return res.json({
              success: true,
              reply: textPart,
              widgets: hasDraftWidget ? localResult.widgets : buildWidgets(queryLower, dbContext, detectedIntents),
            });
          }
        }
      } catch (geminiError) {
        console.warn('Gemini API call failed, falling back to local engine:', geminiError.message);
      }
    }

    // Local Intelligent Engine (Enhanced Semantic Matcher + Local Tool Drafting Fallback)
    const { reply, widgets } = await generateLocalResponse(query, queryLower, lang, dbContext, detectedIntents);
    return res.json({
      success: true,
      reply,
      widgets,
    });
  } catch (err) {
    console.error('AI Assistant Endpoint Error:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses pesan asisten.' });
  }
});

// POST /api/assistant/confirm-booking
// Direct 1-tap booking confirmation endpoint for all services
router.post('/confirm-booking', assistantLimiter, async (req, res) => {
  try {
    const { draft, userId, paymentMethod = 'cash' } = req.body;
    if (!draft || !draft.serviceType) {
      return res.status(400).json({ success: false, message: 'Data draf pesanan tidak lengkap' });
    }

    const rawServiceType = String(draft.serviceType || 'ride').toLowerCase();
    const serviceType = rawServiceType === 'asuh' ? 'babysit' : rawServiceType;
    const finalPaymentMethod = (paymentMethod || draft.paymentMethod || 'cash').toLowerCase();
    const finalPrice = Number(draft.priceEstimate) || 0;
    const detailsObj = draft.details || {};

    const pickupCoords = detailsObj.originCoords || resolveLombokLocation(detailsObj.origin);
    const dropoffCoords = detailsObj.destCoords || resolveLombokLocation(detailsObj.destination || detailsObj.address);

    let merchantId = draft.merchantId || detailsObj.merchantId || null;
    if (!merchantId && (serviceType === 'food' || serviceType === 'villa')) {
      const nameToMatch = detailsObj.merchantName || detailsObj.restaurantName || detailsObj.villaName;
      if (nameToMatch) {
        const specificWords = nameToMatch.split(/\s+/).filter(w => !['villa', 'vila', 'warung', 'resto', 'restoran', 'rm', 'hotel', 'resort'].includes(w.toLowerCase()));
        const searchTerm = specificWords[0] || nameToMatch.split(/\s+/)[0];
        const { data: matchedM } = await supabase
          .from('merchants')
          .select('id')
          .eq('service_type', serviceType)
          .eq('listing_status', 'approved')
          .ilike('name', `%${searchTerm}%`)
          .limit(1)
          .maybeSingle();
        if (matchedM?.id) merchantId = matchedM.id;
      }
    }

    const orderRow = {
      user_id: userId || null,
      service_type: serviceType,
      merchant_id: merchantId,
      title: draft.title || `Pesanan ${draft.serviceName || serviceType}`,
      details: typeof detailsObj === 'object' ? JSON.stringify(detailsObj) : String(detailsObj),
      total_price: finalPrice,
      status: finalPaymentMethod === 'qris' ? 'awaiting_payment' : 'pending',
      payment_method: finalPaymentMethod === 'qris' ? 'qris' : 'cash',
      payment_status: 'unpaid',
      pickup_lat: pickupCoords.lat ?? -8.8955,
      pickup_lng: pickupCoords.lng ?? 116.2780,
      dropoff_lat: dropoffCoords.lat ?? -8.8955,
      dropoff_lng: dropoffCoords.lng ?? 116.2780,
      delivery_fee: serviceType === 'food' ? 10000 : 0,
      metadata: {
        source: 'wira_ai_assistant',
        draft_id: draft.draftId,
        service_name: draft.serviceName,
        booking_details: detailsObj,
      },
    };

    if (serviceType === 'send') {
      const validSizes = ['dokumen', 'kecil', 'sedang', 'besar', 'mobil'];
      const rawSize = (detailsObj.packageSize || 'kecil').toLowerCase();
      orderRow.package_size = validSizes.includes(rawSize) ? rawSize : 'kecil';
    } else if (serviceType === 'villa') {
      const nights = Number(detailsObj.nights) || 1;
      orderRow.nights = Math.max(1, Math.min(30, nights));
      const checkInIso = resolveIsoDate(detailsObj.checkInDate, 1);
      const checkOutIso = resolveIsoDate(detailsObj.checkOutDate, 1 + orderRow.nights);
      orderRow.check_in = checkInIso;
      orderRow.check_out = checkOutIso;
      orderRow.metadata.check_in = checkInIso;
      orderRow.metadata.check_out = checkOutIso;
    } else if (['service', 'pool', 'babysit', 'bersih'].includes(serviceType)) {
      orderRow.scheduled_at = new Date().toISOString();
    }

    const { data: createdOrder, error } = await supabase
      .from('orders')
      .insert([orderRow])
      .select()
      .single();

    if (error) {
      console.error('Error inserting order in Supabase:', error);
      return res.status(500).json({ success: false, message: 'Gagal membuat pesanan di database: ' + error.message });
    }

    // If QRIS payment, insert linked topup_requests row so QrisOrderPayment displays exact nominal
    if (finalPaymentMethod === 'qris') {
      try {
        const qrisBase = Math.ceil(finalPrice / 1000) * 1000;
        await supabase.from('topup_requests').insert({
          user_id: userId || null,
          amount: qrisBase,
          status: 'pending',
          method: 'manual',
          order_id: createdOrder.id,
        });
      } catch (qErr) {
        console.warn('topup_requests insert for QRIS skipped:', qErr.message);
      }
    }

    // If service is Bersih (Housekeeping or Waste quote), also replicate to specific tables if relevant
    if (serviceType === 'bersih') {
      try {
        if (detailsObj.subType === 'housekeeping') {
          const hkOrderNo = `HK-${Date.now().toString().slice(-6)}`;
          await supabase.from('housekeeping_orders').insert({
            order_no: hkOrderNo,
            user_id: userId || null,
            property_name: detailsObj.address || 'Villa Kuta',
            service_type: 'deep_clean',
            scheduled_date: new Date().toISOString().slice(0, 10),
            scheduled_time: '09:00:00',
            address: detailsObj.address || 'Kuta Lombok',
            price: finalPrice,
            status: 'pending',
          });
        } else {
          const quoteNo = `BR-${Date.now().toString().slice(-6)}`;
          await supabase.from('waste_quotes').insert({
            quote_no: quoteNo,
            user_id: userId || null,
            address: detailsObj.address || 'Kuta Lombok',
            requested_date: new Date().toISOString().slice(0, 10),
            quoted_price: finalPrice,
            status: 'pending',
          });
        }
      } catch (subErr) {
        console.warn('Replication to specific bersih table skipped:', subErr.message);
      }
    }

    return res.json({
      success: true,
      orderId: createdOrder.id,
      order: createdOrder,
      trackingUrl: `/active-order/${createdOrder.id}`,
      message: 'Pesanan berhasil dikonfirmasi dan sedang dikirim ke mitra!',
    });
  } catch (err) {
    console.error('Confirmation Endpoint Error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengonfirmasi pesanan.' });
  }
});

// Generate appropriate rich widgets based on query and context
function buildWidgets(queryLower, dbContext, detectedIntents) {
  const widgets = [];
  const sortedIntents = Object.entries(detectedIntents || {}).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

  // Villa Widgets
  if (detectedIntents.villa && (primaryIntent === 'villa' || !['food', 'pool', 'bersih', 'excavator', 'service', 'ride', 'asuh'].includes(primaryIntent))) {
    if (dbContext.villas && dbContext.villas.length > 0) {
      const v = dbContext.villas[0];
      widgets.push({
        type: 'villa',
        id: v.id,
        title: v.name,
        address: v.address,
        price: v.pricePerNight,
        rating: v.rating,
        image: v.image,
        ctaText: 'Pesan di WiraVilla →',
        ctaPath: '/villa',
      });
    } else {
      widgets.push({
        type: 'villa',
        id: 'villa-kuta-default',
        title: 'Villa Segara Kuta Lombok',
        address: 'Jl. Pariwisata Kuta, Pujut, Lombok Tengah',
        price: 850000,
        rating: 4.9,
        image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
        ctaText: 'Pesan di WiraVilla →',
        ctaPath: '/villa',
      });
    }
  }

  // Food Widgets
  if (detectedIntents.food) {
    if (dbContext.restaurants && dbContext.restaurants.length > 0) {
      const r = dbContext.restaurants[0];
      widgets.push({
        type: 'food',
        id: r.id,
        title: r.name,
        address: r.address,
        category: r.category,
        rating: r.rating,
        image: r.image,
        ctaText: 'Buka Restoran →',
        ctaPath: `/restaurant/${r.id}`,
      });
    } else {
      widgets.push({
        type: 'food',
        id: 'food-taliwang-default',
        title: 'Ayam Taliwang Bu Mirah',
        address: 'Kuta Lombok • Buka Sekarang',
        category: 'Kuliner Khas Lombok',
        rating: 4.8,
        price: 45000,
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
        ctaText: 'Buka Menu WiraFood →',
        ctaPath: '/food',
      });
    }
  }

  // Order Tracking Widget
  if (dbContext.activeOrders && dbContext.activeOrders.length > 0) {
    const o = dbContext.activeOrders[0];
    widgets.push({
      type: 'tracking',
      orderId: o.id,
      serviceType: o.service_type,
      status: o.status,
      ctaText: 'Lacak Posisi Driver →',
      ctaPath: `/active-order/${o.id}`,
    });
  }

  // Excavator / Heavy Equipment Widget
  if (detectedIntents.excavator) {
    widgets.push({
      type: 'service',
      serviceKey: 'service',
      title: 'Sewa Excavator Mini PC-50',
      subtitle: 'Mitra Alat Berat Lombok • Operator & Solar',
      price: 250000,
      unit: '/jam',
      ctaText: 'Ajukan Sewa Alat Berat →',
      ctaPath: '/service',
    });
  }

  // Pool Care Widget
  if (detectedIntents.pool) {
    widgets.push({
      type: 'service',
      serviceKey: 'pool',
      title: 'Perawatan Kolam Renang (WiraPool)',
      subtitle: 'Water Testing, Vacuum, & Chemical Balancing',
      price: 150000,
      unit: '/visit',
      ctaText: 'Jadwalkan Perawatan →',
      ctaPath: '/pool',
    });
  }

  // Sampun Bersih / Housekeeping Widget
  if (detectedIntents.bersih) {
    widgets.push({
      type: 'service',
      serviceKey: 'bersih',
      title: 'Sampun Bersih & Housekeeping',
      subtitle: 'Pengangkutan Sampah Rutin & Kebersihan Villa',
      ctaText: 'Lihat Layanan WiraBersih →',
      ctaPath: '/bersih',
    });
  }

  // Technician / AC Service
  if (detectedIntents.service && !detectedIntents.excavator) {
    widgets.push({
      type: 'service',
      serviceKey: 'service',
      title: 'Servis AC & Teknisi (WiraService)',
      subtitle: 'Cuci AC, Perbaikan Pipa & Kelistrikan Villa',
      price: 75000,
      unit: '/unit',
      ctaText: 'Pesan Teknisi Sekarang →',
      ctaPath: '/service',
    });
  }

  // Babysitter / WiraAsuh
  if (detectedIntents.asuh) {
    widgets.push({
      type: 'service',
      serviceKey: 'asuh',
      title: 'Pengasuh Anak (WiraAsuh)',
      subtitle: 'Babysitter Terverifikasi ke Rumah atau Villa',
      price: 50000,
      unit: '/jam',
      ctaText: 'Pesan Babysitter →',
      ctaPath: '/asuh',
    });
  }

  // Ride Booking Widget
  if (detectedIntents.ride && widgets.length === 0) {
    widgets.push({
      type: 'ride',
      title: 'Pesan WiraRide Sekarang',
      subtitle: 'Driver lokal terdekat siap menjemput Anda di Lombok',
      ctaText: 'Buka WiraRide →',
      ctaPath: '/ride',
    });
  }

  return widgets.filter((w) => Boolean(w && typeof w === 'object' && w.type));
}

// Local smart generator for fallback when Gemini is unavailable
async function generateLocalResponse(query, queryLower, lang, dbContext, detectedIntents) {
  let reply;
  const isEn = lang === 'en';
  const isBookingQuery = /pesen|pesan|sewa|booking|order|panggil|kuras|angkut|cari baby|titip|kirim|mau|butuh|tolong|carikan|antar|jemput|makan|lapar|laper|nginep|inap|servis|service|bego|kolam|bersih|sampah|nanny|babysitter/i.test(queryLower);
  const hasServiceIntent = Boolean(
    detectedIntents.ride || detectedIntents.food || detectedIntents.send ||
    detectedIntents.villa || detectedIntents.bersih || detectedIntents.pool ||
    detectedIntents.service || detectedIntents.excavator || detectedIntents.asuh
  );

  const sortedIntents = Object.entries(detectedIntents || {}).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

  // 1. Synthesize interactive in-chat booking_draft widget directly for all service inquiries
  if (hasServiceIntent || isBookingQuery) {
    // 1a. WiraPool
    if (primaryIntent === 'pool' || (!primaryIntent && (detectedIntents.pool || /kolam|kuras/i.test(queryLower)))) {
      const address = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Villa Kuta Lombok';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftPoolBooking', {
        serviceCategory: 'Kuras & Vacuum Kolam Renang',
        address,
        date: 'Hari ini',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1b. WiraBersih
    if (primaryIntent === 'bersih' || (!primaryIntent && (detectedIntents.bersih || /sampah|housekeeping|bersih/i.test(queryLower)))) {
      const isHk = /housekeeping|turnover|kamar|bersih villa/i.test(queryLower);
      const address = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftBersihBooking', {
        subType: isHk ? 'housekeeping' : 'sampah',
        address,
        date: 'Besok pagi',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1c. WiraService / Excavator
    if (primaryIntent === 'service' || primaryIntent === 'excavator' || (!primaryIntent && (detectedIntents.service || detectedIntents.excavator || /ac|teknisi|tukang|excavator|bego|pipa|listrik/i.test(queryLower)))) {
      const isExcavator = primaryIntent === 'excavator' || /excavator|ekskavator|bego|alat berat/i.test(queryLower);
      let addr = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || (isExcavator ? 'Praya, Lombok Tengah' : 'Kuta Lombok');
      if (/praya/i.test(queryLower)) addr = 'Praya, Lombok Tengah';
      else if (/kuta/i.test(queryLower)) addr = 'Kuta Lombok';
      else if (/mataram/i.test(queryLower)) addr = 'Kota Mataram';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftServiceBooking', {
        serviceCategory: isExcavator ? 'excavator' : 'ac',
        problemDescription: isExcavator ? 'Sewa Excavator Mini PC-50 di Praya' : 'Servis & Cuci AC Villa',
        address: addr,
        date: 'Besok pagi',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1d. WiraAsuh
    if (primaryIntent === 'asuh' || (!primaryIntent && (detectedIntents.asuh || /baby\s*sitter|babysitter|asuh|balita|anak/i.test(queryLower)))) {
      const hoursMatch = queryLower.match(/(\d+)\s*jam/i);
      const durationHours = hoursMatch ? parseInt(hoursMatch[1], 10) : 4;
      const address = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftAsuhBooking', {
        careType: 'Pengasuh Balita & Anak',
        durationHours,
        address,
        date: 'Hari ini',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1e. WiraSend
    if (primaryIntent === 'send' || (!primaryIntent && (detectedIntents.send || /kirim|paket|dokumen|barang|kurir/i.test(queryLower)))) {
      const sendKe = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:dari|jemput|sekarang)|$)/i);
      const sendDari = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju)|$)/i);

      const origin = sendDari ? sendDari[1].trim() : (dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok');
      const destination = sendKe ? sendKe[1].trim() : 'Kota Mataram';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftSendBooking', {
        origin,
        destination,
        packageType: 'Dokumen / Paket Kilat',
        packageSize: 'kecil',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1f. WiraFood
    if (primaryIntent === 'food' || (!primaryIntent && (detectedIntents.food || /makan|taliwang|puyung|ayam|porsi|lapar|laper|kuliner|resto|restoran|warung/i.test(queryLower)))) {
      let restoName = dbContext.restaurants?.[0]?.name || 'Ayam Taliwang Bu Mirah';
      let items = '2 porsi Ayam Taliwang Bu Mirah';
      if (/puyung|nasi balap/i.test(queryLower)) {
        restoName = 'Nasi Balap Puyung Inaq Esun';
        items = 'Nasi Balap Puyung Spesial';
      } else if (/taliwang/i.test(queryLower)) {
        const pMatch = queryLower.match(/(\d+)\s*porsi/i);
        items = pMatch ? `${pMatch[1]} porsi Ayam Taliwang Bu Mirah` : '2 porsi Ayam Taliwang Bu Mirah';
      } else if (dbContext.restaurants?.[0]?.name) {
        restoName = dbContext.restaurants[0].name;
        items = `Menu Rekomendasi ${restoName}`;
      }

      const deliveryAddress = dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || 'Kuta Lombok';

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftFoodOrder', {
        restaurantName: restoName,
        items,
        deliveryAddress,
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1g. WiraVilla
    if (primaryIntent === 'villa' || (!primaryIntent && (detectedIntents.villa || /kamar|villa|vila|nginep|hotel|homestay/i.test(queryLower)))) {
      const nightsMatch = queryLower.match(/(\d+)\s*malam/i);
      const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : 2;

      let vName = dbContext.villas?.[0]?.name || 'Villa Segara Kuta Lombok';
      if (/talas/i.test(queryLower)) {
        vName = 'Villa Talas';
      }

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftVillaBooking', {
        villaName: vName,
        nights,
        checkInDate: 'Besok',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }

    // 1h. WiraRide
    const isRideHailing = primaryIntent === 'ride' || (!primaryIntent && (detectedIntents.ride || /ojek|taksi|motor|mobil|jemput|antar|transport|pesankan/i.test(queryLower) || /(?:dari\s+.+\s+ke\s+|ke\s+)/i.test(queryLower)));
    if (isRideHailing) {
      const isCar = /mobil|car|taksi|taxi/i.test(queryLower);
      const keMatch = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:jemput|dari|sekarang|pagi|siang)|$)/i);
      const dariMatch = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju)|$)/i);

      let origin = dariMatch ? dariMatch[1].trim() : (dbContext.userCurrentLocation?.address || dbContext.savedAddresses?.[0]?.address || dbContext.userLastOrderLocation?.address || 'Lokasi Anda Saat Ini');
      let destination = keMatch ? keMatch[1].trim() : 'Pantai Kuta Lombok';

      if (origin.toLowerCase() === destination.toLowerCase()) {
        destination = origin.toLowerCase().includes('pantai kuta')
          ? 'Bandara Internasional Lombok (LOP)'
          : 'Pantai Kuta Mandalika, Lombok';
      }

      const { draft, reply: draftReply } = await buildDraftFromToolCall('draftRideBooking', {
        vehicleType: isCar ? 'car' : 'motor',
        origin,
        destination,
        notes: isEn ? 'Immediate pickup' : 'Jemput sekarang',
      }, dbContext, lang, queryLower);

      if (draft) {
        return { reply: draftReply, widgets: [draft] };
      }
    }
  }

  // Conversational Intent Matching (Info & Recommendations)
  if (primaryIntent === 'villa') {
    reply = isEn
      ? 'I found great private villa options in Lombok with private pool amenities! Check out the recommendation below:'
      : 'Tentu! Saya menemukan rekomendasi villa privat terbaik di Lombok dengan fasilitas private pool di bawah ini:';
  } else if (primaryIntent === 'food') {
    reply = isEn
      ? 'Here are top-rated local culinary favorites in Lombok on WiraFood! You can explore menus and order right away:'
      : 'Berikut rekomendasi kuliner khas Lombok paling favorit di WiraFood! Anda bisa langsung membuka menu dan memesan:';
  } else if (primaryIntent === 'tracking') {
    if (dbContext.activeOrders && dbContext.activeOrders.length > 0) {
      reply = isEn
        ? 'You have an active order in progress! Tap below to track your driver live on the map:'
        : 'Pesanan Anda saat ini sedang dalam proses! Klik tombol di bawah untuk melacak posisi mitra driver secara live:';
    } else {
      reply = isEn
        ? 'You currently do not have any running orders. Need a ride or want to order food?'
        : 'Saat ini belum ada pesanan yang sedang berjalan. Ingin memesan ojek, makanan, atau layanan lain?';
    }
  } else if (primaryIntent === 'excavator') {
    reply = isEn
      ? 'We offer heavy equipment rentals (Mini Excavator PC-50) through verified local partners on WiraService across Praya, Pujut, and Kuta Lombok.'
      : 'Kami menyediakan sewa alat berat (Excavator Mini PC-50) melalui mitra terverifikasi di WiraService untuk area Praya, Pujut, dan Kuta Lombok.';
  } else if (primaryIntent === 'pool') {
    reply = isEn
      ? 'Need swimming pool cleaning or water chemical balancing? WiraPool provides verified technicians for your villa.'
      : 'Air kolam renang butuh perawatan atau pembersihan? Teknisi WiraPool siap datang memeriksa kadar air dan vacuum kolam villa Anda.';
  } else if (primaryIntent === 'bersih') {
    reply = isEn
      ? 'For villa housekeeping and eco-friendly waste management in Kuta Lombok, Sampun Bersih (WiraBersih) is ready to help!'
      : 'Untuk kebersihan villa dan pengangkutan sampah rutin ramah lingkungan di Kuta Lombok, Sampun Bersih (WiraBersih) siap melayani Anda!';
  } else if (primaryIntent === 'service') {
    reply = isEn
      ? 'Need an AC repair, electrical, or plumbing technician? Verified technicians from WiraService are ready to visit your home or villa.'
      : 'Butuh teknisi servis AC, perbaikan pipa, atau instalasi listrik? Teknisi terverifikasi di WiraService siap datang ke rumah atau villa Anda.';
  } else if (primaryIntent === 'asuh') {
    reply = isEn
      ? 'Looking for a trusted babysitter or nanny in Lombok? WiraAsuh provides experienced caregivers directly to your location.'
      : 'Mencari pengasuh anak atau babysitter terpercaya di Lombok? WiraAsuh menyediakan perawat anak berpengalaman yang siap datang ke lokasi Anda.';
  } else if (primaryIntent === 'ride') {
    reply = isEn
      ? 'Need transportation around Lombok or an airport transfer (LOP)? WiraRide is ready with local drivers.'
      : 'Butuh transportasi keliling Lombok atau antar-jemput Bandara Internasional Lombok (LOP)? Mitra WiraRide siap mengantar Anda dengan tarif transparan.';
  } else if (primaryIntent === 'payment') {
    reply = isEn
      ? 'Wira supports Cash payments and instant QRIS for every order. WiraPay digital wallet is currently deactivated for regulatory compliance.'
      : 'Wira mendukung pembayaran Tunai langsung dan QRIS di setiap pemesanan. Saldo WiraPay saat ini sedang dinonaktifkan sesuai regulasi.';
  } else {
    reply = isEn
      ? 'Hello! I am your Wira AI Concierge. I can help you find villas in Lombok, order authentic local food on WiraFood, book rides, or arrange home and cleaning services. How can I help you today?'
      : 'Halo! Saya Asisten Wira AI, pemandu lokal Anda di Lombok. Saya dapat membantu mencari villa, memesan kuliner khas Lombok, ojek/taksi online, sewa alat berat, hingga perawatan villa & kolam renang. Ada yang bisa saya bantu?';
  }

  return {
    reply,
    widgets: buildWidgets(queryLower, dbContext, detectedIntents),
  };
}

module.exports = router;
