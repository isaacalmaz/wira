import API_BASE_URL from '../config/api';
import { supabase } from '../config/supabase';

/**
 * Send a message to Wira AI Assistant.
 * Tries the backend proxy first (which connects to Gemini / tool calling),
 * and falls back gracefully to direct client-side Supabase contextual resolution
 * if the backend is unreachable.
 */
export async function sendAssistantMessage({
  message,
  userId,
  lang = 'id',
  activeOrders = [],
  userLocation = null,
  savedAddresses = [],
}) {
  if (!message || !message.trim()) return null;

  const query = message.trim();
  const queryLower = query.toLowerCase();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: query,
        userId,
        lang,
        userLocation,
        savedAddresses,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.reply) {
        return {
          reply: data.reply,
          widgets: Array.isArray(data.widgets)
            ? data.widgets.filter((w) => Boolean(w && typeof w === 'object' && w.type))
            : [],
        };
      }
    }
  } catch (err) {
    console.warn('Backend assistant endpoint unavailable, using client fallback:', err.message);
  }

  // Client-side fallback with real Supabase data & local semantic parsing
  return await resolveClientAssistant({ query, queryLower, lang, activeOrders, userLocation, savedAddresses });
}

function resolveIsoDate(text, offsetDays = 1) {
  if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Confirm a booking draft created by Wira AI Assistant.
 * Dispatches directly to backend /api/assistant/confirm-booking,
 * with graceful client-side Supabase insertion fallback.
 */
export async function confirmAssistantBooking({ draft, userId, paymentMethod = 'cash' }) {
  if (!draft || !draft.serviceType) {
    throw new Error('Draf pesanan tidak valid.');
  }

  const selectedPaymentMethod = (paymentMethod || draft.paymentMethod || 'cash').toLowerCase();

  // 1. Try backend confirmation endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${API_BASE_URL}/assistant/confirm-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        draft,
        userId,
        paymentMethod: selectedPaymentMethod,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.orderId) {
        return {
          success: true,
          orderId: data.orderId,
          order: data.order,
          trackingUrl: data.trackingUrl || `/active-order/${data.orderId}`,
          message: data.message || 'Pesanan berhasil dikonfirmasi!',
        };
      }
    }
  } catch (err) {
    console.warn('Backend confirm-booking failed, falling back to direct client Supabase:', err.message);
  }

  // 2. Direct client Supabase fallback
  const rawType = String(draft.serviceType || 'ride').toLowerCase();
  const serviceType = rawType === 'asuh' ? 'babysit' : rawType;
  const detailsObj = draft.details || {};
  const orderRow = {
    user_id: userId || null,
    service_type: serviceType,
    merchant_id: draft.merchantId || detailsObj.merchantId || null,
    title: draft.title || `Pesanan ${draft.serviceName || serviceType}`,
    details: typeof detailsObj === 'object' ? JSON.stringify(detailsObj) : String(detailsObj),
    total_price: Number(draft.priceEstimate) || 0,
    status: selectedPaymentMethod === 'qris' ? 'awaiting_payment' : 'pending',
    payment_method: selectedPaymentMethod === 'qris' ? 'qris' : 'cash',
    payment_status: 'unpaid',
    pickup_lat: detailsObj.originCoords?.lat ?? -8.8955,
    pickup_lng: detailsObj.originCoords?.lng ?? 116.2780,
    dropoff_lat: detailsObj.destCoords?.lat ?? -8.8955,
    dropoff_lng: detailsObj.destCoords?.lng ?? 116.2780,
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

  const { data, error } = await supabase
    .from('orders')
    .insert([orderRow])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    success: true,
    orderId: data.id,
    order: data,
    trackingUrl: `/active-order/${data.id}`,
    message: 'Pesanan berhasil dikonfirmasi!',
  };
}

const INTENT_PATTERNS = {
  ride: [
    'ride', 'ojek', 'taksi', 'taxi', 'motor', 'mobil', 'jemput', 'antar', 'anterin', 'tumpangan',
    'bonceng', 'jalan-jalan', 'keliling', 'bandara', 'airport', 'lop', 'senggigi',
    'praya', 'pantai', 'selong belanak', 'tanjung aan', 'mandalika', 'transport', 'transportasi', 'go'
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

  // Disambiguation
  if (scores.pool && scores.villa) {
    if (queryLower.match(/kuras|keruh|hijau|lumut|kaporit|chlorine|vacuum|perawatan kolam/i)) {
      scores.pool += 5;
    }
  }
  if (scores.bersih && scores.villa) {
    if (queryLower.match(/sampah|buang|angkut|kotor|bersih|housekeeping/i)) {
      scores.bersih += 5;
    }
  }

  return scores;
}

// Known Lombok landmark coordinate mappings
const LOMBOK_LOCATIONS = {
  bandara: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  lop: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  airport: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  'social yard': { name: 'The Social Yard, Jl. Pariwisata Kuta, Lombok', lat: -8.8912, lng: 116.2818 },
  kuta: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
  'pantai kuta': { name: 'Pantai Kuta Mandalika, Lombok', lat: -8.8955, lng: 116.2780 },
  praya: { name: 'Praya, Lombok Tengah', lat: -8.7067, lng: 116.2800 },
  mataram: { name: 'Kota Mataram', lat: -8.5833, lng: 116.1167 },
  rektorat: { name: 'Rektorat Universitas Mataram, Jl. Majapahit, Mataram', lat: -8.5901, lng: 116.0964 },
  unram: { name: 'Universitas Mataram, Mataram', lat: -8.5901, lng: 116.0964 },
  epicentrum: { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  senggigi: { name: 'Pantai Senggigi', lat: -8.5042, lng: 116.0505 },
  'selong belanak': { name: 'Pantai Selong Belanak, Lombok Barat', lat: -8.8683, lng: 116.1600 },
  'tanjung aan': { name: 'Pantai Tanjung Aan, Lombok Tengah', lat: -8.9080, lng: 116.3210 },
  mandalika: { name: 'Pertamina Mandalika International Circuit', lat: -8.8920, lng: 116.3050 },
  'villa talas': { name: 'Villa Talas, Kuta Lombok', lat: -8.8970, lng: 116.2840 },
  ashtari: { name: 'Ashtari Lounge, Kuta Lombok', lat: -8.9012, lng: 116.2731 },
  kenza: { name: 'Kenza Cafe, Jl. Raya Kuta, Lombok', lat: -8.8925, lng: 116.2805 },
  gerupuk: { name: 'Pantai Gerupuk (Surfing Spot), Lombok Tengah', lat: -8.9220, lng: 116.3350 },
  'batu payung': { name: 'Batu Payung, Lombok Tengah', lat: -8.9150, lng: 116.3280 },
  'bukit merese': { name: 'Bukit Merese, Pujut, Lombok Tengah', lat: -8.9120, lng: 116.3190 },
  default: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
};

function isSelfLocationQuery(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return /^(tempat saya|lokasi saya|posisi saya|titik saya|sini|di sini|dari sini|rumah saya|kost saya|villa saya|my location|my place|here)$/i.test(t) ||
    t === 'tempat saya' || t === 'lokasi saya' || t === 'sini' || t === 'posisi saya' || t === 'rumah saya';
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
  if (isCar) {
    const fare = distKm <= 3 ? 35000 : 35000 + Math.ceil(distKm - 3) * 6000;
    return Math.ceil(fare / 5000) * 5000;
  }
  const fare = distKm <= 2 ? 12000 : 12000 + Math.ceil(distKm - 2) * 2500;
  return Math.ceil(fare / 1000) * 1000;
}

function resolveLombokLocation(text, { userLocation, savedAddresses } = {}) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // If user references their own location ("tempat saya", "lokasi saya", "sini")
  if (isSelfLocationQuery(lower)) {
    if (userLocation && userLocation.address) {
      return {
        name: `${userLocation.address} (Lokasi Anda)`,
        lat: userLocation.lat || -8.8955,
        lng: userLocation.lng || 116.2780,
        isUserLocation: true,
      };
    }
    if (savedAddresses && savedAddresses.length > 0) {
      const primary = savedAddresses.find((a) => a.is_primary) || savedAddresses[0];
      return {
        name: `${primary.address} (${primary.label || 'Alamat Tersimpan'})`,
        lat: primary.lat || -8.8955,
        lng: primary.lng || 116.2780,
        isUserLocation: true,
      };
    }
    // Location is completely unknown, return null so conversational slot-filling asks the user
    return null;
  }

  const sortedEntries = Object.entries(LOMBOK_LOCATIONS).sort((a, b) => b[0].length - a[0].length);
  for (const [key, loc] of sortedEntries) {
    if (key !== 'default' && lower.includes(key)) {
      return { name: loc.name, lat: loc.lat, lng: loc.lng };
    }
  }
  return { name: text.trim(), lat: LOMBOK_LOCATIONS.default.lat, lng: LOMBOK_LOCATIONS.default.lng };
}

// Client-side fallback handler
async function resolveClientAssistant({ queryLower, lang, activeOrders = [], userLocation = null, savedAddresses = [] }) {
  const isEn = lang === 'en';
  let reply;
  const widgets = [];
  const detectedIntents = detectIntents(queryLower);
  const sortedIntents = Object.entries(detectedIntents).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

  const isBookingQuery = /pesen|pesan|sewa|booking|order|panggil|kuras|angkut|cari baby|titip|kirim|mau|butuh|tolong|carikan|antar|jemput|makan|lapar|laper|nginep|inap|servis|service|bego|kolam|bersih|sampah|nanny|babysitter/i.test(queryLower);
  const hasServiceIntent = Boolean(
    detectedIntents.ride || detectedIntents.food || detectedIntents.send ||
    detectedIntents.villa || detectedIntents.bersih || detectedIntents.pool ||
    detectedIntents.service || detectedIntents.excavator || detectedIntents.asuh
  );

  // Direct Booking Draft synthesis in local client fallback
  if (hasServiceIntent || isBookingQuery) {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. WiraRide
    if (detectedIntents.ride || /ojek|taksi|motor|mobil|jemput|antar|transport/i.test(queryLower)) {
      const isCar = /mobil|car|taksi|taxi/i.test(queryLower);
      const keMatch = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:jemput|dari|sekarang|pagi|siang)|$)/i);
      const dariMatch = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju|sekarang|pagi|siang)|$)/i);

      let rawOrigin = dariMatch ? dariMatch[1].trim() : (userLocation?.address || savedAddresses?.[0]?.address || 'Bandara Internasional Lombok (LOP)');
      let rawDest = keMatch ? keMatch[1].trim() : 'Pantai Kuta Lombok';

      if (rawOrigin.toLowerCase() === rawDest.toLowerCase() || (rawDest.toLowerCase().includes('kuta') && rawOrigin.toLowerCase().includes('kuta'))) {
        rawDest = 'Bandara Internasional Lombok (LOP)';
      }

      let originLoc = resolveLombokLocation(rawOrigin, { userLocation, savedAddresses }) || { name: rawOrigin, lat: -8.8955, lng: 116.2780 };
      let destLoc = resolveLombokLocation(rawDest, { userLocation, savedAddresses }) || { name: rawDest, lat: -8.7600, lng: 116.2760 };

      if (originLoc.name === destLoc.name || (originLoc.lat === destLoc.lat && originLoc.lng === destLoc.lng)) {
        if (destLoc.name.toLowerCase().includes('kuta') || destLoc.name.toLowerCase().includes('pantai')) {
          originLoc = { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 };
        } else {
          destLoc = { name: 'Pantai Kuta Mandalika, Lombok', lat: -8.8955, lng: 116.2780 };
        }
      }

      const distKm = calculateDistanceKm(originLoc.lat, originLoc.lng, destLoc.lat, destLoc.lng);
      const price = calculateRideFare(distKm, isCar);
      const vName = isCar ? (isEn ? 'WiraRide (Car)' : 'WiraRide (Mobil)') : (isEn ? 'WiraRide (Motor)' : 'WiraRide (Motor)');

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'ride',
        serviceName: vName,
        title: `${isEn ? 'Ride Booking' : 'Pesan Ojek/Mobil'}: ${originLoc.name} ➔ ${destLoc.name}`,
        subtitle: isEn ? `Verified local driver pickup (${distKm.toFixed(1)} km)` : `Mitra driver lokal terdekat siap menjemput (${distKm.toFixed(1)} km)`,
        details: {
          origin: originLoc.name,
          destination: destLoc.name,
          vehicleType: isCar ? 'car' : 'motor',
          distanceKm: parseFloat(distKm.toFixed(1)),
          date: isEn ? 'Today' : 'Hari ini',
          time: isEn ? 'Now' : 'Sekarang',
          notes: isEn ? 'Immediate pickup' : 'Jemput sekarang',
          originCoords: { lat: originLoc.lat, lng: originLoc.lng },
          destCoords: { lat: destLoc.lat, lng: destLoc.lng },
        },
        priceEstimate: price,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `I have prepared your ${vName} booking from ${originLoc.name} to ${destLoc.name} (${distKm.toFixed(1)} km) with estimated fare of Rp ${price.toLocaleString('id-ID')}. Confirm below to order hands-free!`
        : `Saya sudah menyiapkan draf pesanan ${vName} dari ${originLoc.name} menuju ${destLoc.name} (${distKm.toFixed(1)} km) dengan estimasi tarif Rp ${price.toLocaleString('id-ID')}. Silakan periksa rincian di bawah dan tekan konfirmasi untuk memesan langsung!`;

      return { reply, widgets };
    }

    // 2. WiraFood
    if (detectedIntents.food || /makan|taliwang|puyung|ayam|porsi|lapar|laper|kuliner|resto|restoran|warung/i.test(queryLower)) {
      let restoName = 'Ayam Taliwang Bu Mirah';
      let items = '2 porsi Ayam Taliwang Bu Mirah';
      if (/puyung|nasi balap/i.test(queryLower)) {
        restoName = 'Nasi Balap Puyung Inaq Esun';
        items = 'Nasi Balap Puyung Spesial';
      } else if (/taliwang/i.test(queryLower)) {
        const pMatch = queryLower.match(/(\d+)\s*porsi/i);
        items = pMatch ? `${pMatch[1]} porsi Ayam Taliwang Bu Mirah` : '2 porsi Ayam Taliwang Bu Mirah';
      }

      const destAddr = userLocation?.address || savedAddresses?.[0]?.address || 'Kuta Lombok';

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'food',
        serviceName: 'WiraFood',
        title: `Pesan WiraFood: ${restoName}`,
        subtitle: isEn ? 'Hot culinary delivery to your doorstep' : 'Pesanan makanan siap diantar driver terdekat ke lokasi Anda',
        details: {
          merchantName: restoName,
          items,
          destination: destAddr,
          notes: 'Antar hangat',
        },
        priceEstimate: 55000,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `Your WiraFood draft from ${restoName} (${items}) is ready. Estimated cost is Rp 55.000. Tap below to confirm!`
        : `Draf pesanan WiraFood dari ${restoName} (${items}) telah siap dengan estimasi total Rp 55.000. Silakan konfirmasi di bawah!`;

      return { reply, widgets };
    }

    // 3. WiraSend
    if (detectedIntents.send || /kirim|paket|dokumen|barang|kurir/i.test(queryLower)) {
      const sendKe = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:dari|jemput|sekarang)|$)/i);
      const sendDari = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju)|$)/i);

      const origin = sendDari ? sendDari[1].trim() : (userLocation?.address || savedAddresses?.[0]?.address || 'Kuta Lombok');
      const destination = sendKe ? sendKe[1].trim() : 'Kota Mataram';

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'send',
        serviceName: 'WiraSend',
        title: `Kirim Paket WiraSend: ${origin} ➔ ${destination}`,
        subtitle: isEn ? 'Fast on-demand courier in Lombok' : 'Kurir instan kilat dan aman ke seluruh Lombok',
        details: {
          origin,
          destination,
          packageType: 'Dokumen / Paket Kilat',
          packageSize: 'kecil',
          recipientName: 'Penerima di lokasi',
          notes: 'Hati-hati bawa paket',
        },
        priceEstimate: 25000,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? 'WiraSend courier draft created. Estimated fare is Rp 25.000. Confirm below to dispatch!'
        : 'Draf pengiriman WiraSend sudah siap. Estimasi ongkir Rp 25.000. Silakan konfirmasi draf di bawah!';

      return { reply, widgets };
    }

    // 4. WiraVilla
    if (detectedIntents.villa || /kamar|villa|vila|nginep|hotel|homestay/i.test(queryLower)) {
      const nightsMatch = queryLower.match(/(\d+)\s*malam/i);
      const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : 2;

      let vName = 'Villa Segara Kuta Lombok';
      if (/talas/i.test(queryLower)) {
        vName = 'Villa Talas';
      }

      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const checkOut = new Date(Date.now() + (nights + 1) * 86400000).toISOString().slice(0, 10);

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'villa',
        serviceName: 'WiraVilla',
        title: `Reservasi WiraVilla: ${vName}`,
        subtitle: isEn ? 'Private villa with private pool & ocean view' : 'Villa privat eksklusif dengan fasilitas private pool di Lombok',
        details: {
          villaName: vName,
          nights,
          checkInDate: tomorrow,
          checkOutDate: checkOut,
          displayDate: 'Besok',
          guests: 2,
          notes: 'Reservasi kamar privat',
        },
        priceEstimate: nights * 850000,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `Reservation draft created for ${vName} (${nights} nights). Tap confirm below!`
        : `Draf reservasi ${vName} untuk ${nights} malam telah siap. Silakan konfirmasi draf di bawah!`;

      return { reply, widgets };
    }

    // 5. WiraBersih
    if (detectedIntents.bersih || /sampah|housekeeping|bersih/i.test(queryLower)) {
      const isHk = /housekeeping|turnover|kamar|bersih villa/i.test(queryLower);
      const price = isHk ? 150000 : 45000;
      const label = isHk ? 'Housekeeping Villa' : 'Pengangkutan Sampah (Sampun Bersih)';
      const address = userLocation?.address || savedAddresses?.[0]?.address || 'Kuta Lombok';

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'bersih',
        serviceName: 'WiraBersih (Sampun Bersih)',
        title: `Layanan WiraBersih: ${label}`,
        subtitle: isEn ? 'Eco-friendly waste management & villa cleaning' : 'Pengangkutan sampah rutin & kebersihan villa ramah lingkungan Kuta Lombok',
        details: {
          subType: isHk ? 'housekeeping' : 'sampah',
          address,
          date: 'Besok pagi',
          time: 'Pagi / Jam kerja',
          notes: 'Sampun Bersih Kuta Lombok',
        },
        priceEstimate: price,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `WiraBersih (${label}) booking draft created. Price: Rp ${price.toLocaleString('id-ID')}. Tap confirm below!`
        : `Draf pesanan WiraBersih (${label}) telah disiapkan dengan tarif Rp ${price.toLocaleString('id-ID')}. Silakan konfirmasi di bawah!`;

      return { reply, widgets };
    }

    // 6. WiraPool
    if (detectedIntents.pool || /kolam|kuras/i.test(queryLower)) {
      const address = userLocation?.address || savedAddresses?.[0]?.address || 'Villa Kuta Lombok';
      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'pool',
        serviceName: 'WiraPool',
        title: 'Perawatan & Kuras Kolam Renang (WiraPool)',
        subtitle: isEn ? 'Water testing, tile vacuum, & chemical balancing' : 'Pembersihan lumut, vacuum, dan penyeimbangan kadar air & kaporit/pH',
        details: {
          serviceCategory: 'Perawatan Kolam Villa Rutin & Kuras',
          address,
          date: 'Hari ini',
          notes: 'Pengecekan kualitas air dan vacuum kolam',
        },
        priceEstimate: 150000,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? 'WiraPool maintenance draft ready at Rp 150.000. Confirm below to schedule your technician!'
        : 'Draf perawatan kolam renang WiraPool telah siap dengan estimasi biaya Rp 150.000. Silakan konfirmasi di bawah!';

      return { reply, widgets };
    }

    // 7. WiraService
    if (detectedIntents.service || detectedIntents.excavator || /ac|teknisi|tukang|excavator|bego|pipa|listrik/i.test(queryLower)) {
      const isExcavator = /excavator|ekskavator|bego|alat berat/i.test(queryLower);

      let addr = userLocation?.address || savedAddresses?.[0]?.address || (isExcavator ? 'Praya, Lombok Tengah' : 'Kuta Lombok');
      if (/praya/i.test(queryLower)) addr = 'Praya, Lombok Tengah';
      else if (/kuta/i.test(queryLower)) addr = 'Kuta Lombok';
      else if (/mataram/i.test(queryLower)) addr = 'Kota Mataram';

      const price = isExcavator ? 250000 : 85000;
      const title = isExcavator ? 'Sewa Excavator Mini PC-50 (WiraService)' : 'Servis Teknisi AC (WiraService)';

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'service',
        serviceName: 'WiraService',
        title,
        subtitle: isExcavator
          ? (isEn ? 'Heavy equipment with certified operator & fuel' : 'Alat berat lengkap operator & solar untuk proyek lahan Lombok')
          : (isEn ? 'Certified technician for AC, electrical, or plumbing' : 'Teknisi terverifikasi untuk perbaikan rumah dan villa'),
        details: {
          serviceCategory: isExcavator ? 'excavator' : 'ac',
          problemDescription: isExcavator ? 'Sewa Excavator Mini PC-50' : 'Cuci & Servis AC Villa',
          address: addr,
          date: 'Besok pagi',
          notes: 'Mitra teknisi profesional',
        },
        priceEstimate: price,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `WiraService booking draft created (${title}). Estimated rate: Rp ${price.toLocaleString('id-ID')}. Tap confirm below!`
        : `Draf pemesanan WiraService (${title}) telah disiapkan dengan estimasi biaya Rp ${price.toLocaleString('id-ID')}. Silakan konfirmasi di bawah!`;

      return { reply, widgets };
    }

    // 8. WiraAsuh
    if (detectedIntents.asuh || /baby\s*sitter|babysitter|asuh|balita|anak/i.test(queryLower)) {
      const hoursMatch = queryLower.match(/(\d+)\s*jam/i);
      const durationHours = hoursMatch ? parseInt(hoursMatch[1], 10) : 4;
      const price = durationHours * 50000;
      const address = userLocation?.address || savedAddresses?.[0]?.address || 'Kuta Lombok';

      widgets.push({
        type: 'booking_draft',
        draftId,
        serviceType: 'babysit',
        serviceName: 'WiraAsuh',
        title: `Pesan WiraAsuh: Babysitter & Pengasuh Anak (${durationHours} Jam)`,
        subtitle: isEn ? 'Verified caring nanny directly to your villa or home' : 'Pengasuh anak terpercaya dan tersertifikasi datang langsung ke villa/rumah',
        details: {
          careType: 'Pengasuh Balita & Anak',
          durationHours,
          childrenCount: 1,
          address,
          date: 'Hari ini',
          notes: 'Pengasuh terverifikasi',
        },
        priceEstimate: price,
        paymentMethod: 'cash',
        status: 'draft',
      });

      reply = isEn
        ? `WiraAsuh childcare draft created (${durationHours} hours). Total fee: Rp ${price.toLocaleString('id-ID')}. Tap confirm below!`
        : `Draf pemesanan WiraAsuh untuk ${durationHours} jam telah siap dengan total Rp ${price.toLocaleString('id-ID')}. Silakan konfirmasi di bawah!`;

      return { reply, widgets };
    }
  }

  // 1. Villa Intent (Catalog browse)
  if (primaryIntent === 'villa') {
    try {
      const stopWords = new Set(['villa', 'vila', 'cari', 'yang', 'dengan', 'pantai', 'inap', 'nginep', 'sewa', 'booking', 'rekomendasi', 'lombok', 'kuta']);
      const words = queryLower.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w));
      let specificFound = false;

      for (const w of words) {
        const { data: specific } = await supabase
          .from('merchants')
          .select('id, name, address, rating, price_per_night, photos')
          .eq('service_type', 'villa')
          .ilike('name', `%${w}%`)
          .limit(2);

        if (specific && specific.length > 0) {
          specific.forEach((v) => {
            widgets.push({
              type: 'villa',
              id: v.id,
              title: v.name,
              address: v.address || 'Kuta Lombok',
              price: v.price_per_night || 850000,
              rating: v.rating || 4.9,
              image: v.photos?.[0] || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
              ctaText: isEn ? 'Book on WiraVilla →' : 'Pesan di WiraVilla →',
              ctaPath: '/villa',
            });
          });
          specificFound = true;
          break;
        }
      }

      if (!specificFound) {
        const { data: villas } = await supabase
          .from('merchants')
          .select('id, name, address, rating, price_per_night, photos')
          .eq('service_type', 'villa')
          .eq('listing_status', 'approved')
          .limit(2);

        if (villas && villas.length > 0) {
          villas.forEach((v) => {
            widgets.push({
              type: 'villa',
              id: v.id,
              title: v.name,
              address: v.address || 'Kuta Lombok',
              price: v.price_per_night || 750000,
              rating: v.rating || 4.9,
              image: v.photos?.[0] || 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
              ctaText: isEn ? 'Book on WiraVilla →' : 'Pesan di WiraVilla →',
              ctaPath: '/villa',
            });
          });
        }
      }
    } catch { /* ignore fallback error */ }

    if (widgets.length === 0) {
      widgets.push({
        type: 'villa',
        id: 'villa-default',
        title: 'Villa Segara Kuta Lombok',
        address: 'Jl. Pariwisata Kuta, Pujut, Lombok Tengah',
        price: 850000,
        rating: 4.9,
        image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
        ctaText: isEn ? 'Book on WiraVilla →' : 'Pesan di WiraVilla →',
        ctaPath: '/villa',
      });
    }

    reply = isEn
      ? 'Here are hand-picked private villas in Lombok with private pools and great ocean proximity:'
      : 'Tentu! Berikut rekomendasi villa privat terbaik di Lombok dengan fasilitas private pool yang bisa Anda pesan langsung:';
  }

  // 2. Food Intent (Catalog browse)
  else if (primaryIntent === 'food') {
    try {
      const foodStopWords = new Set(['makan', 'food', 'kuliner', 'lapar', 'laper', 'ayam', 'ikan', 'nasi', 'resto', 'restoran', 'warung', 'kuta', 'lombok']);
      const foodWords = queryLower.split(/\s+/).filter((w) => w.length > 3 && !foodStopWords.has(w));
      let specificFound = false;

      for (const w of foodWords) {
        const { data: specificFood } = await supabase
          .from('merchants')
          .select('id, name, address, rating, image, photos, category')
          .eq('service_type', 'food')
          .ilike('name', `%${w}%`)
          .limit(2);

        if (specificFood && specificFood.length > 0) {
          specificFood.forEach((f) => {
            widgets.push({
              type: 'food',
              id: f.id,
              title: f.name,
              address: f.address || 'Kuta Lombok',
              category: f.category || 'Kuliner Khas Lombok',
              rating: f.rating || 4.8,
              image: f.image || f.photos?.[0] || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
              ctaText: isEn ? 'View Menu →' : 'Buka Menu Restoran →',
              ctaPath: `/restaurant/${f.id}`,
            });
          });
          specificFound = true;
          break;
        }
      }

      if (!specificFound) {
        const { data: foods } = await supabase
          .from('merchants')
          .select('id, name, address, rating, image, photos, category')
          .eq('service_type', 'food')
          .eq('listing_status', 'approved')
          .limit(2);

        if (foods && foods.length > 0) {
          foods.forEach((f) => {
            widgets.push({
              type: 'food',
              id: f.id,
              title: f.name,
              address: f.address || 'Kuta Lombok',
              category: f.category || 'Kuliner Lombok',
              rating: f.rating || 4.8,
              image: f.image || f.photos?.[0] || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
              ctaText: isEn ? 'View Menu →' : 'Buka Menu Restoran →',
              ctaPath: `/restaurant/${f.id}`,
            });
          });
        }
      }
    } catch { /* ignore */ }

    if (widgets.length === 0) {
      widgets.push({
        type: 'food',
        id: 'food-default',
        title: 'Ayam Taliwang Bu Mirah',
        address: 'Kuta Lombok • Buka Sekarang',
        category: 'Ayam Kampung Bakar Pedas',
        rating: 4.8,
        price: 45000,
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
        ctaText: isEn ? 'Explore WiraFood →' : 'Buka Menu WiraFood →',
        ctaPath: '/food',
      });
    }

    reply = isEn
      ? 'Here are top-rated authentic Lombok eateries on WiraFood. Tap to view menu or order delivery:'
      : 'Berikut rekomendasi kuliner khas Lombok paling favorit di WiraFood. Klik untuk melihat daftar menu atau memesan:';
  }

  // 3. Active Order Tracking Intent
  else if (primaryIntent === 'tracking') {
    const active = (activeOrders || []).find((o) => {
      const s = String(o.rawStatus || '').toLowerCase();
      return s && !['completed', 'cancelled', 'canceled', 'rejected'].includes(s);
    });

    if (active) {
      widgets.push({
        type: 'tracking',
        orderId: active.id,
        serviceType: active.service || 'WiraRide',
        status: active.statusKey || 'home.spot_running',
        ctaText: isEn ? 'Track Live Driver →' : 'Lacak Posisi Driver →',
        ctaPath: `/active-order/${active.id}`,
      });
      reply = isEn
        ? 'You have an active order in progress! Here is your live tracking shortcut:'
        : 'Pesanan Anda saat ini sedang dalam proses! Anda dapat memantau posisi mitra driver secara live di peta:';
    } else {
      reply = isEn
        ? 'You currently do not have any running orders. Would you like to book a ride or order food?'
        : 'Saat ini belum ada pesanan yang sedang berjalan. Ingin memesan ojek/taksi online, makanan, atau layanan lainnya?';
    }
  }

  // 4. Heavy Equipment / Excavator Intent
  else if (primaryIntent === 'excavator') {
    widgets.push({
      type: 'service',
      serviceKey: 'service',
      title: 'Sewa Excavator Mini PC-50',
      subtitle: 'Mitra Alat Berat Lombok • Operator & Solar • Praya & Kuta',
      price: 250000,
      unit: isEn ? '/hour' : '/jam',
      ctaText: isEn ? 'Rent Heavy Equipment →' : 'Ajukan Sewa Alat Berat →',
      ctaPath: '/service',
    });
    reply = isEn
      ? 'We offer heavy equipment rentals (Mini Excavator PC-50) on WiraService for land clearing and projects in Lombok.'
      : 'Kami menyediakan sewa alat berat (Excavator Mini PC-50) via WiraService untuk perataan lahan dan proyek di Lombok.';
  }

  // 5. Pool Intent
  else if (primaryIntent === 'pool') {
    widgets.push({
      type: 'service',
      serviceKey: 'pool',
      title: 'Perawatan Kolam Renang (WiraPool)',
      subtitle: 'Water Testing, Vacuum, & Chemical Balancing',
      price: 150000,
      unit: isEn ? '/visit' : '/visit',
      ctaText: isEn ? 'Schedule Pool Care →' : 'Jadwalkan Perawatan →',
      ctaPath: '/pool',
    });
    reply = isEn
      ? 'WiraPool provides professional pool technicians to balance chemicals, clean tiles, and vacuum your villa pool.'
      : 'Teknisi WiraPool siap melakukan pengecekan kadar air, kaporit/pH, dan vacuum kolam renang villa Anda di Lombok.';
  }

  // 6. Housekeeping / Sampun Bersih Intent
  else if (primaryIntent === 'bersih') {
    widgets.push({
      type: 'service',
      serviceKey: 'bersih',
      title: 'Sampun Bersih & Housekeeping',
      subtitle: 'Pengangkutan Sampah Rutin & Kebersihan Villa Kuta Lombok',
      ctaText: isEn ? 'Explore WiraBersih →' : 'Lihat Layanan WiraBersih →',
      ctaPath: '/bersih',
    });
    reply = isEn
      ? 'Sampun Bersih (WiraBersih) offers villa housekeeping and scheduled eco-friendly waste management in Kuta Lombok.'
      : 'Sampun Bersih (WiraBersih) melayani kebersihan villa dan pengangkutan sampah rutin terjadwal di wilayah Kuta Lombok.';
  }

  // 7. Service / Technician Intent
  else if (primaryIntent === 'service') {
    widgets.push({
      type: 'service',
      serviceKey: 'service',
      title: 'Teknisi & Servis AC / Perbaikan',
      subtitle: 'Servis AC, Pompa Air & Perbaikan Listrik Terverifikasi',
      ctaText: isEn ? 'Book Technician →' : 'Panggil Teknisi →',
      ctaPath: '/service',
    });
    reply = isEn
      ? 'Need an AC repair, electrical, or plumbing technician? Verified technicians from WiraService are ready to visit.'
      : 'Butuh teknisi servis AC, perbaikan pipa, atau instalasi listrik? Teknisi terverifikasi di WiraService siap datang ke rumah atau villa Anda.';
  }

  // 8. Babysitter / Child Care Intent
  else if (primaryIntent === 'asuh') {
    widgets.push({
      type: 'service',
      serviceKey: 'asuh',
      title: 'Pengasuh Anak (WiraAsuh)',
      subtitle: 'Babysitter & Nanny Terpercaya di Lombok',
      ctaText: isEn ? 'Book Babysitter →' : 'Pesan Pengasuh Anak →',
      ctaPath: '/asuh',
    });
    reply = isEn
      ? 'Looking for a trusted babysitter or nanny in Lombok? WiraAsuh provides experienced caregivers directly to your location.'
      : 'Mencari pengasuh anak atau babysitter terpercaya di Lombok? WiraAsuh menyediakan perawat anak berpengalaman yang siap datang ke lokasi Anda.';
  }

  // 9. Ride Intent
  else if (primaryIntent === 'ride') {
    widgets.push({
      type: 'ride',
      title: isEn ? 'Book WiraRide' : 'Pesan WiraRide Sekarang',
      subtitle: isEn ? 'Local drivers available across Lombok' : 'Driver lokal terdekat siap mengantar Anda',
      ctaText: isEn ? 'Open WiraRide →' : 'Buka WiraRide →',
      ctaPath: '/ride',
    });
    reply = isEn
      ? 'Need a motorcycle or car ride? WiraRide connects you to trusted local drivers with transparent pricing.'
      : 'Butuh tumpangan motor atau mobil? WiraRide menghubungkan Anda dengan mitra driver lokal terpercaya di Lombok.';
  }

  // 10. Payment Info Intent
  else if (primaryIntent === 'payment') {
    reply = isEn
      ? 'Wira supports Cash payments and instant QRIS for every order. WiraPay digital wallet is currently deactivated for regulatory compliance.'
      : 'Wira mendukung pembayaran Tunai langsung dan QRIS di setiap pemesanan. Saldo WiraPay saat ini sedang dinonaktifkan sesuai regulasi.';
  }

  // Default Fallback
  else {
    reply = isEn
      ? 'Hello! I am your Wira AI Concierge. I can help you find villas in Lombok, order authentic local food on WiraFood, book rides, or arrange home and cleaning services. How can I help you today?'
      : 'Halo! Saya Asisten Wira AI, pemandu lokal Anda di Lombok. Saya dapat membantu mencari villa, memesan kuliner khas Lombok, ojek/taksi online, sewa alat berat, hingga perawatan villa & kolam renang. Ada yang bisa saya bantu?';
  }

  return { reply, widgets };
}
