import API_BASE_URL from '../config/api';
import { supabase } from '../config/supabase';
import { fetchRoute } from '../utils/osmHelpers';
import { withAddressNote } from '../utils/addressNote';

/**
 * Send a message to Wira AI Assistant.
 * Uses structured intent understanding (/api/assistant/understand) to extract
 * user parameters (vehicle, places, notes, scheduled time, hourly mode) without guessing.
 * All route calculation, geocoding, and fare estimation are performed factually
 * on the client side with 100% portal rate parity.
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

  // 1. Try structured intent understanding endpoint (/api/assistant/understand)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const uRes = await fetch(`${API_BASE_URL}/assistant/understand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: query,
        lang,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (uRes.ok) {
      const uData = await uRes.json();
      if (uData?.success && uData?.intent) {
        const intent = uData.intent;
        if (intent.service === 'ride' && intent.ride) {
          return await synthesizeRideDraftFromIntent({
            intent: intent.ride,
            lang,
            userLocation,
            savedAddresses,
          });
        }
      }
    }
  } catch (uErr) {
    console.warn('Backend understand endpoint unavailable, using client fallback:', uErr.message);
  }

  // 2. Client-side fallback with real Supabase data & local semantic parsing
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
  const pLat = detailsObj.originCoords?.lat ?? detailsObj.pickup?.lat ?? null;
  const pLng = detailsObj.originCoords?.lng ?? detailsObj.pickup?.lng ?? null;
  const dLat = detailsObj.destCoords?.lat ?? detailsObj.dropoff?.lat ?? null;
  const dLng = detailsObj.destCoords?.lng ?? detailsObj.dropoff?.lng ?? null;

  const enrichedDetails = typeof detailsObj === 'object' && detailsObj !== null
    ? {
        ...detailsObj,
        pickup: {
          name: detailsObj.origin || detailsObj.pickup?.name || detailsObj.pickup || detailsObj.address || 'Lokasi Jemput',
          lat: pLat,
          lng: pLng,
        },
        dropoff: {
          name: detailsObj.destination || detailsObj.dropoff?.name || detailsObj.dropoff || detailsObj.address || 'Tujuan',
          lat: dLat,
          lng: dLng,
        },
      }
    : detailsObj;

  const orderRow = {
    user_id: userId || null,
    service_type: serviceType,
    merchant_id: draft.merchantId || detailsObj.merchantId || null,
    title: draft.title || `Pesanan ${draft.serviceName || serviceType}`,
    details: typeof enrichedDetails === 'object' ? JSON.stringify(enrichedDetails) : String(enrichedDetails),
    total_price: Number(draft.priceEstimate) || 0,
    status: selectedPaymentMethod === 'qris' ? 'awaiting_payment' : 'pending',
    payment_method: selectedPaymentMethod === 'qris' ? 'qris' : 'cash',
    payment_status: 'unpaid',
    rate_code: serviceType === 'ride' ? ((detailsObj.vehicleType === 'car' || detailsObj.vehicleType === 'mobil') ? 'mobil' : 'motor') : null,
    pickup_lat: pLat,
    pickup_lng: pLng,
    dropoff_lat: dLat,
    dropoff_lng: dLng,
    pickup_address: detailsObj.origin || detailsObj.pickup?.name || detailsObj.address || null,
    dropoff_address: detailsObj.destination || detailsObj.dropoff?.name || detailsObj.address || null,
    distance_meters: detailsObj.distanceKm ? Math.round(Number(detailsObj.distanceKm) * 1000) : null,
    delivery_fee: serviceType === 'food' ? 10000 : 0,
    metadata: {
      source: 'wira_ai_assistant',
      draft_id: draft.draftId,
      service_name: draft.serviceName,
      booking_details: detailsObj,
      ...(detailsObj.hourly ? { hourly: detailsObj.hourly } : {}),
      ...(detailsObj.scheduledAt ? { scheduled_at: detailsObj.scheduledAt } : {}),
    },
  };

  if (detailsObj.scheduledAt) {
    orderRow.scheduled_at = detailsObj.scheduledAt;
  }
  if (detailsObj.pickupLandmarkNote) {
    orderRow.pickup_note = detailsObj.pickupLandmarkNote;
  }

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
  'temu coffeeshop': { name: 'TEMU Coffee & Space, Jl. Bung Karno, Mataram', lat: -8.6021, lng: 116.1137 },
  'temu coffee & space': { name: 'TEMU Coffee & Space, Jl. Bung Karno, Mataram', lat: -8.6021, lng: 116.1137 },
  'temu coffee': { name: 'TEMU Coffee & Space, Jl. Bung Karno, Mataram', lat: -8.6021, lng: 116.1137 },
  'temu': { name: 'TEMU Coffee & Space, Jl. Bung Karno, Mataram', lat: -8.6021, lng: 116.1137 },
  'lombok epicentrum mall': { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  'mall epicentrum': { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  'epicentrum mall': { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  epicentrum: { name: 'Lombok Epicentrum Mall, Mataram', lat: -8.5912, lng: 116.1045 },
  'mataram mall': { name: 'Mataram Mall, Cakranegara', lat: -8.5905, lng: 116.1265 },
  'transmart': { name: 'Transmart Mataram', lat: -8.5925, lng: 116.1360 },
  'transmart mataram': { name: 'Transmart Mataram', lat: -8.5925, lng: 116.1360 },
  'islamic center': { name: 'Islamic Center Hubbul Wathan NTB, Mataram', lat: -8.5778, lng: 116.1105 },
  'islamic center lombok': { name: 'Islamic Center Hubbul Wathan NTB, Mataram', lat: -8.5778, lng: 116.1105 },
  'rsud kota mataram': { name: 'RSUD Kota Mataram', lat: -8.6005, lng: 116.1110 },
  'rsud provinsi ntb': { name: 'RSUD Provinsi NTB, Dasan Cermen', lat: -8.6075, lng: 116.1470 },
  'rsud praya': { name: 'RSUD Praya, Lombok Tengah', lat: -8.7050, lng: 116.2750 },
  default: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
};

export function isSelfLocationQuery(text) {
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

export function calculateRideFare(distKm, isCar = false) {
  const basePrice = isCar ? 15000 : 8000;
  const perKmRate = isCar ? 4000 : 2000;
  const extraKm = Math.max(0, distKm - 2);
  return Math.ceil((basePrice + Math.ceil(extraKm * perKmRate)) / 500) * 500;
}

async function getOsmRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    const route = await fetchRoute({ lat: lat1, lng: lon1 }, { lat: lat2, lng: lon2 });
    if (route && route.distance) {
      const distKm = parseFloat((route.distance / 1000).toFixed(1));
      const durationMins = Math.ceil(route.duration / 60);
      return { distKm, durationMins, source: 'osrm' };
    }
  } catch (_) {
    // fallback to calibrated distance
  }

  const crowKm = calculateDistanceKm(lat1, lon1, lat2, lon2);
  const distKm = parseFloat((crowKm * 1.15).toFixed(1));
  const durationMins = Math.max(3, Math.ceil(distKm * 1.5));
  return { distKm, durationMins, source: 'calibrated' };
}

function resolveLombokLocation(text, { userLocation, savedAddresses } = {}) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();
  const userLoc = userLocation;
  const savedAddrs = savedAddresses || [];

  // 1. Direct self-location reference ("tempat saya", "lokasi saya", "sini")
  if (isSelfLocationQuery(lower)) {
    if (userLoc && userLoc.lat && userLoc.lng) {
      return {
        name: userLoc.address ? userLoc.address : 'Lokasi Anda Saat Ini',
        lat: Number(userLoc.lat),
        lng: Number(userLoc.lng),
        isUserLocation: true,
      };
    }
    // Never guess coordinates if user device GPS is unavailable
    return null;
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
        lat: Number(s.lat),
        lng: Number(s.lng),
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

  // 5. If unknown landmark:
  // Never guess Kuta or default coordinates! Return null so the assistant asks for clarification.
  return null;
}

const dynamicGeocodeCache = new Map();

export async function resolvePlaceCoordinates(text, { userLocation, savedAddresses } = {}) {
  const local = resolveLombokLocation(text, { userLocation, savedAddresses });
  if (local) return local;

  if (!text || typeof text !== 'string' || text.trim().length < 3) return null;
  const cleanText = text.trim();
  const cacheKey = cleanText.toLowerCase();
  if (dynamicGeocodeCache.has(cacheKey)) {
    return dynamicGeocodeCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanText)}&format=json&limit=1&bounded=1&viewbox=115.8,-8.1,116.8,-9.1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'id,en' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        if (lat <= -8.1 && lat >= -9.2 && lng >= 115.8 && lng <= 116.9) {
          const parts = (data[0].display_name || cleanText).split(',');
          const shortName = parts.slice(0, 2).join(',').trim();
          const resolved = {
            name: shortName || cleanText,
            lat,
            lng,
            isGeocoded: true,
          };
          dynamicGeocodeCache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }
  } catch (_) {
    // proceed to return null
  }

  return null;
}

export async function synthesizeRideDraftFromIntent({
  intent,
  lang = 'id',
  userLocation = null,
  savedAddresses = [],
}) {
  const isEn = lang === 'en';
  const timingMode = ['now', 'later', 'hourly'].includes(intent.timingMode) ? intent.timingMode : 'now';
  const isHourly = timingMode === 'hourly';
  const isLater = timingMode === 'later';
  const hourlyHours = Number(intent.timingHours) > 0 ? Math.min(24, Math.max(1, Math.round(Number(intent.timingHours)))) : 4;
  const isCar = intent.vehicle === 'mobil' || (isHourly && intent.vehicle !== 'motor');

  // 1. Resolve Pickup
  let pickup = null;
  const isSelfPickup = Boolean(intent.pickupIsCurrentLocation) || (!intent.pickupText && !isHourly);

  if (isSelfPickup || isSelfLocationQuery(intent.pickupText)) {
    if (userLocation?.lat && userLocation?.lng) {
      pickup = {
        name: userLocation.address || (isEn ? 'Your Current Location' : 'Lokasi Anda Saat Ini'),
        lat: Number(userLocation.lat),
        lng: Number(userLocation.lng),
        isUserLocation: true,
      };
    } else {
      return {
        reply: isEn
          ? 'Wira AI requires your device coordinates for pickup at your current location. Please enable GPS permissions on your device, or specify your exact pickup location/landmark in Lombok so the route and fare can be calculated factually.'
          : 'Wira AI membutuhkan titik koordinat lokasi Anda untuk penjemputan di tempat Anda saat ini. Mohon aktifkan GPS atau izinkan akses lokasi pada perangkat Anda, atau sebutkan nama patokan/desa/jalan penjemputan Anda secara spesifik agar penjemputan dan tarif akurat tanpa menebak.',
        widgets: [],
      };
    }
  } else if (intent.pickupText) {
    pickup = await resolvePlaceCoordinates(intent.pickupText, { userLocation, savedAddresses });
    if (!pickup) {
      return {
        reply: isEn
          ? `Could you please clarify your pickup location "${intent.pickupText}" in Lombok? (e.g. mention the village, subdistrict, or nearest landmark)`
          : `Mohon klarifikasi titik penjemputan "${intent.pickupText}" di Lombok lebih spesifik (misalnya: nama jalan, desa, kecamatan, atau patokan terdekat) agar lokasi jemput dan ongkos faktual tanpa menebak.`,
        widgets: [],
      };
    }
  } else {
    if (userLocation?.lat && userLocation?.lng) {
      pickup = {
        name: userLocation.address || (isEn ? 'Your Current Location' : 'Lokasi Anda Saat Ini'),
        lat: Number(userLocation.lat),
        lng: Number(userLocation.lng),
        isUserLocation: true,
      };
    } else {
      return {
        reply: isEn
          ? 'Where should the driver pick you up? Please specify your pickup point in Lombok (or enable GPS).'
          : 'Di mana lokasi penjemputan Anda? Mohon sebutkan lokasi titik jemput di Lombok atau aktifkan GPS Anda.',
        widgets: [],
      };
    }
  }

  const pickupLandmark = (intent.pickupLandmarkNote || '').trim();
  const pickupDisplayName = pickupLandmark ? withAddressNote(pickup.name, pickupLandmark) : pickup.name;

  // 2. Resolve Dropoff
  let dropoff = null;
  let dropoffDisplayName = null;

  if (isHourly) {
    dropoff = {
      name: isEn ? `Hourly Tour (${hourlyHours}h)` : `Sewa Keliling Lombok (${hourlyHours} Jam)`,
      lat: pickup.lat,
      lng: pickup.lng,
    };
    dropoffDisplayName = dropoff.name;
  } else {
    if (!intent.dropoffText) {
      return {
        reply: isEn
          ? 'Where would you like to go? Please specify your destination in Lombok (e.g. Bandara Lombok, Praya, Kuta) so the route and fare can be calculated factually.'
          : 'Ke mana lokasi tujuan perjalanan Anda di Lombok? Mohon sebutkan lokasi tujuan Anda (misalnya: Bandara Lombok, Praya, Kuta) agar rute dan ongkos dapat dihitung secara faktual tanpa menebak.',
        widgets: [],
      };
    }

    dropoff = await resolvePlaceCoordinates(intent.dropoffText, { userLocation, savedAddresses });
    if (!dropoff) {
      return {
        reply: isEn
          ? `Could you please clarify your destination "${intent.dropoffText}" in Lombok? (e.g. mention the village, subdistrict, or nearest landmark like Sengkol, Kuta, Praya) so I can calculate the factual route and fare.`
          : `Mohon klarifikasi lokasi tujuan "${intent.dropoffText}" di Lombok lebih spesifik (misalnya: nama desa, kecamatan, atau patokan terdekat seperti Sengkol, Kuta, Praya) agar rute dan tarif dapat dihitung secara faktual tanpa menebak.`,
        widgets: [],
      };
    }

    const dropoffLandmark = (intent.dropoffLandmarkNote || '').trim();
    dropoffDisplayName = dropoffLandmark ? withAddressNote(dropoff.name, dropoffLandmark) : dropoff.name;
  }

  // 3. Distance & Pricing calculation
  let distKm = null;
  let durationMins = null;
  let motorPrice = 8000;
  let carPrice = 15000;

  if (isHourly) {
    motorPrice = hourlyHours * 25000;
    carPrice = hourlyHours * 60000;
    durationMins = hourlyHours * 60;
  } else {
    const routeInfo = await getOsmRouteDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    distKm = routeInfo.distKm;
    durationMins = routeInfo.durationMins;
    motorPrice = calculateRideFare(distKm, false);
    carPrice = calculateRideFare(distKm, true);
  }

  const price = isCar ? carPrice : motorPrice;
  const vehicleName = isCar
    ? (isEn ? 'WiraRide (Car)' : 'WiraRide (Mobil)')
    : (isEn ? 'WiraRide (Motor)' : 'WiraRide (Motor)');

  // 4. Schedule & Time label
  let scheduledAtIso = null;
  let timeLabel = isEn ? 'Now' : 'Sekarang';

  if (isLater) {
    const relMin = Number(intent.timingRelativeMinutes);
    if (Number.isFinite(relMin) && relMin > 0) {
      const schedDate = new Date(Date.now() + relMin * 60000);
      scheduledAtIso = schedDate.toISOString();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(schedDate.getHours())}:${pad(schedDate.getMinutes())}`;
      const relHrs = Math.round(relMin / 60);
      const relText = relMin >= 60
        ? (isEn ? `in ${relHrs} hours` : `dalam ${relHrs} jam`)
        : (isEn ? `in ${relMin} mins` : `dalam ${relMin} menit`);
      timeLabel = isEn ? `Today at ${timeStr} (${relText})` : `Hari ini pk ${timeStr} (${relText})`;
    } else if (intent.timingLocalDateTime) {
      scheduledAtIso = new Date(intent.timingLocalDateTime).toISOString();
      timeLabel = intent.timingLocalDateTime.replace('T', ' pk ');
    } else {
      timeLabel = isEn ? 'Later (Scheduled)' : 'Nanti (Terjadwal)';
    }
  } else if (isHourly) {
    timeLabel = isEn ? `Rental: ${hourlyHours} Hours` : `Sewa ${hourlyHours} Jam`;
  }

  // 5. Construct routeUrl for 1-click channeling
  const routeParams = new URLSearchParams();
  routeParams.set('pickup', pickupDisplayName);
  routeParams.set('pickupLat', String(pickup.lat));
  routeParams.set('pickupLng', String(pickup.lng));
  if (dropoff && !isHourly) {
    routeParams.set('dropoff', dropoffDisplayName);
    routeParams.set('dropoffLat', String(dropoff.lat));
    routeParams.set('dropoffLng', String(dropoff.lng));
  }
  routeParams.set('vehicle', isCar ? 'mobil' : 'motor');
  routeParams.set('mode', timingMode);
  if (isHourly) {
    routeParams.set('hours', String(hourlyHours));
  }
  if (scheduledAtIso) {
    routeParams.set('scheduled', scheduledAtIso);
  }
  if (pickupLandmark) {
    routeParams.set('note', pickupLandmark);
  }
  const routeUrl = `/ride?${routeParams.toString()}`;

  // 6. Build Draft Card
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const draft = {
    type: 'booking_draft',
    draftId,
    serviceType: 'ride',
    serviceName: vehicleName,
    title: isHourly
      ? (isEn ? `Hourly Rental (${hourlyHours}h): ${pickup.name}` : `Sewa Kendaraan ${hourlyHours} Jam: ${pickup.name}`)
      : `${isEn ? 'Ride Booking' : 'Pesan Ojek/Mobil'}: ${pickup.name} ➔ ${dropoff.name}`,
    subtitle: isHourly
      ? (isEn ? `Private driver on standby for ${hourlyHours} hours` : `Driver privat siap mendampingi selama ${hourlyHours} jam`)
      : (isEn ? `Verified local driver pickup (${distKm} km • ~${durationMins} mins)` : `Mitra driver lokal terdekat siap menjemput (${distKm} km • ~${durationMins} mnt)`),
    details: {
      origin: pickupDisplayName,
      destination: dropoffDisplayName,
      vehicleType: isCar ? 'car' : 'motor',
      distanceKm: distKm,
      durationMins,
      motorPrice,
      carPrice,
      routeUrl,
      date: isEn ? 'Today' : 'Hari ini',
      time: timeLabel,
      notes: pickupLandmark
        ? `Patokan: ${pickupLandmark}`
        : (isHourly ? `Sewa ${hourlyHours} Jam` : (isLater ? timeLabel : (isEn ? 'Immediate pickup' : 'Jemput sekarang'))),
      pickupLandmarkNote: pickupLandmark || null,
      originCoords: { lat: pickup.lat, lng: pickup.lng },
      destCoords: { lat: dropoff.lat, lng: dropoff.lng },
      pickup: { name: pickupDisplayName, lat: pickup.lat, lng: pickup.lng },
      dropoff: { name: dropoffDisplayName, lat: dropoff.lat, lng: dropoff.lng },
      rate_code: isCar ? 'mobil' : 'motor',
      distance_meters: distKm ? Math.round(distKm * 1000) : null,
      timingMode,
      scheduledAt: scheduledAtIso,
      hourly: isHourly ? { hours: hourlyHours } : null,
    },
    priceEstimate: price,
    paymentMethod: 'cash',
    status: 'draft',
  };

  // 7. Natural polite Indonesian reply
  let reply = '';
  if (isHourly) {
    reply = isEn
      ? `I have prepared a ${vehicleName} rental draft for ${hourlyHours} hours from ${pickupDisplayName}. Total rental fare is Rp ${price.toLocaleString('id-ID')}. Confirm below to book directly or view on map!`
      : `Saya sudah menyiapkan draf sewa ${vehicleName} selama ${hourlyHours} jam dari ${pickupDisplayName}. Total tarif sewa Rp ${price.toLocaleString('id-ID')} (lengkap driver & operasional). Silakan konfirmasi di bawah atau klik tombol untuk melihat rute di peta!`;
  } else if (isLater) {
    reply = isEn
      ? `I have scheduled your ${vehicleName} booking from ${pickupDisplayName} to ${dropoffDisplayName} for ${timeLabel} (${distKm} km • ~${durationMins} mins). Fare is Rp ${price.toLocaleString('id-ID')}. Confirm below to lock your booking!`
      : `Saya sudah menyiapkan pesanan terjadwal ${vehicleName} dari ${pickupDisplayName} menuju ${dropoffDisplayName} untuk ${timeLabel} (${distKm} km • ~${durationMins} mnt) dengan tarif Rp ${price.toLocaleString('id-ID')}. Silakan periksa rincian di bawah dan tekan konfirmasi!`;
  } else {
    reply = isEn
      ? `I have prepared your ${vehicleName} booking from ${pickupDisplayName} to ${dropoffDisplayName} (${distKm} km • ~${durationMins} mins) with estimated fare of Rp ${price.toLocaleString('id-ID')}. Driver is ready for pickup!`
      : `Saya sudah menyiapkan draf pesanan ${vehicleName} dari ${pickupDisplayName} menuju ${dropoffDisplayName} (${distKm} km • ~${durationMins} mnt) dengan tarif Rp ${price.toLocaleString('id-ID')}. Mitra driver lokal terdekat siap menjemput sekarang. Silakan periksa rincian di bawah dan tekan konfirmasi untuk memesan langsung!`;
  }

  return { reply, widgets: [draft] };
}

export function parseRideFallbackClient(message) {
  const q = (message || '').trim().toLowerCase();
  const isCar = /mobil|car|taksi|taxi/i.test(q);
  const isMotor = /motor|ojek|bike/i.test(q);
  const vehicle = isCar ? 'mobil' : (isMotor ? 'motor' : null);

  let timingMode = 'now';
  let timingRelativeMinutes = null;
  let timingHours = null;

  const hourlyMatch = q.match(/sewa(?:\s+mobil|\s+motor)?\s+(\d+)\s*jam/i);
  if (hourlyMatch) {
    timingMode = 'hourly';
    timingHours = parseInt(hourlyMatch[1], 10);
  } else {
    const relMatch = q.match(/(?:dalam|lagi)\s+(\d+)\s*(jam|menit)/i) || q.match(/(\d+)\s*(jam|menit)\s*(?:ke\s+depan|lagi)/i);
    if (relMatch) {
      timingMode = 'later';
      const num = parseInt(relMatch[1], 10);
      const unit = relMatch[2].toLowerCase();
      timingRelativeMinutes = unit.startsWith('jam') ? num * 60 : num;
    }
  }

  const isSelf = isSelfLocationQuery(q);

  let pickupText = null;
  let pickupLandmarkNote = null;
  let dropoffText = null;
  let dropoffLandmarkNote = null;

  const dariMatch = q.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s()_-]+?)(?:\s+(?:\bke\b|mnuju|menuju|tujuan)|$)/i);
  if (dariMatch) {
    let raw = dariMatch[1].trim();
    const noteMatch = raw.match(/\(([^)]+)\)/);
    if (noteMatch) {
      pickupLandmarkNote = noteMatch[1].trim();
      raw = raw.replace(/\([^)]+\)/, '').trim();
    }
    if (isSelfLocationQuery(raw)) {
      pickupText = null;
    } else {
      pickupText = raw;
    }
  }

  const keMatch = q.match(/(?:\bke\b|mnuju|menuju|tujuan)\s+([a-zA-Z0-9\s()_-]+?)(?:\s+(?:sekarang|nanti|besok|pagi|siang|sore|malam)|$)/i);
  if (keMatch) {
    let raw = keMatch[1].trim();
    const noteMatch = raw.match(/\(([^)]+)\)/);
    if (noteMatch) {
      dropoffLandmarkNote = noteMatch[1].trim();
      raw = raw.replace(/\([^)]+\)/, '').trim();
    }
    dropoffText = raw;
  }

  return {
    vehicle,
    pickupText,
    pickupIsCurrentLocation: isSelf || (!pickupText && timingMode !== 'hourly'),
    pickupLandmarkNote,
    dropoffText,
    dropoffLandmarkNote,
    timingMode,
    timingRelativeMinutes,
    timingLocalDateTime: null,
    timingHours,
    notes: null,
  };
}

// Client-side fallback handler
async function resolveClientAssistant({ query = '', queryLower, lang, activeOrders = [], userLocation = null, savedAddresses = [] }) {
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
    const isRideHailing = detectedIntents.ride || /ojek|taksi|motor|mobil|jemput|antar|sewa mobil|transport|pesankan/i.test(queryLower) || /(?:dari\s+.+\s+(?:ke|mnuju|menuju)\s+|(?:ke|mnuju|menuju)\s+)/i.test(queryLower);
    if (isRideHailing) {
      const fallbackParsed = parseRideFallbackClient(query);
      return await synthesizeRideDraftFromIntent({
        intent: fallbackParsed,
        lang,
        userLocation,
        savedAddresses,
      });
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
