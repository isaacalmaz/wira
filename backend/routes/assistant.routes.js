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

// Known Lombok landmark coordinate mappings
const LOMBOK_LOCATIONS = {
  bandara: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  lop: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  airport: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
  kuta: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
  'pantai kuta': { name: 'Pantai Kuta Lombok', lat: -8.8955, lng: 116.2780 },
  praya: { name: 'Praya, Lombok Tengah', lat: -8.7067, lng: 116.2800 },
  mataram: { name: 'Kota Mataram', lat: -8.5833, lng: 116.1167 },
  senggigi: { name: 'Pantai Senggigi', lat: -8.5042, lng: 116.0505 },
  'selong belanak': { name: 'Pantai Selong Belanak', lat: -8.8683, lng: 116.1600 },
  'tanjung aan': { name: 'Pantai Tanjung Aan', lat: -8.9080, lng: 116.3210 },
  mandalika: { name: 'Sirkuit Mandalika', lat: -8.8920, lng: 116.3050 },
  default: { name: 'Kuta Lombok', lat: -8.8955, lng: 116.2780 },
};

function resolveLombokLocation(text) {
  if (!text || typeof text !== 'string') return LOMBOK_LOCATIONS.default;
  const lower = text.toLowerCase();
  for (const [key, loc] of Object.entries(LOMBOK_LOCATIONS)) {
    if (key !== 'default' && lower.includes(key)) {
      return { name: text.trim(), lat: loc.lat, lng: loc.lng };
    }
  }
  return { name: text.trim(), lat: LOMBOK_LOCATIONS.default.lat, lng: LOMBOK_LOCATIONS.default.lng };
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

// Helper: Query real database context for AI
async function fetchDbContext(queryLower, userId, detectedIntents) {
  const context = {
    villas: [],
    restaurants: [],
    activeOrders: [],
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
        description: 'Draft a ride hailing booking for WiraRide (motorcycle or car ride hailing in Lombok)',
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
function buildDraftFromToolCall(toolName, args, dbContext, lang = 'id', queryLower = '') {
  const isEn = lang === 'en';
  const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let draft = null;
  let reply = '';

  switch (toolName) {
    case 'draftRideBooking': {
      const isCar = args.vehicleType === 'car' || args.vehicleType === 'mobil';
      const originRaw = (args.origin || '').trim();
      const destRaw = (args.destination || '').trim();
      const isPlaceholder = /belum|unknown|tbd|tidak tahu|tidak ada/i.test(originRaw + destRaw);
      const hasRideLocations = queryLower.match(/(?:ke|tujuan|menuju|dari|jemput)/i) ||
        /kuta|bandara|lop|praya|mataram|senggigi|aan|belanak|mandalika/i.test(queryLower);

      if (!originRaw || !destRaw || isPlaceholder || (!hasRideLocations && originRaw.toLowerCase() === destRaw.toLowerCase())) {
        return {
          draft: null,
          reply: isEn
            ? 'Where would you like to be picked up and where are you going in Lombok? (e.g. "Order a motorbike ride to Kuta Beach pickup at Airport now")'
            : 'Mau dijemput di mana dan tujuannya ke mana? Beri tahu lokasi jemput dan tujuan Anda (contoh: "pesenin ojek motor ke Pantai Kuta jemput di Bandara sekarang").',
        };
      }

      const originLoc = resolveLombokLocation(originRaw);
      const destLoc = resolveLombokLocation(destRaw);
      const priceEstimate = isCar ? 85000 : 25000;
      const vName = isCar ? (isEn ? 'WiraRide (Car)' : 'WiraRide (Mobil)') : (isEn ? 'WiraRide (Motor)' : 'WiraRide (Motor)');

      draft = {
        type: 'booking_draft',
        draftId,
        serviceType: 'ride',
        serviceName: vName,
        title: `${isEn ? 'Ride Booking' : 'Pesan Ojek/Mobil'}: ${originLoc.name} ➔ ${destLoc.name}`,
        subtitle: isEn ? 'Verified local driver pickup in Lombok' : 'Mitra driver lokal terdekat siap menjemput di Lombok',
        details: {
          origin: originLoc.name,
          destination: destLoc.name,
          vehicleType: isCar ? 'car' : 'motor',
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
        ? `I have drafted your ${vName} ride from ${originLoc.name} to ${destLoc.name}. Estimated fare is Rp ${priceEstimate.toLocaleString('id-ID')}. Please check details below and tap confirm to order hands-free!`
        : `Saya sudah menyiapkan draf pesanan ${vName} dari ${originLoc.name} menuju ${destLoc.name} dengan estimasi tarif Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan periksa rincian di bawah dan tekan konfirmasi untuk memesan langsung!`;
      break;
    }

    case 'draftFoodOrder': {
      const itemsRaw = (args.items || '').trim();
      const isPlaceholder = !itemsRaw || /belum|unknown|tbd|pilihan/i.test(itemsRaw);
      const hasFoodTerms = /makan|taliwang|puyung|ayam|ikan|nasi|sate|plecing|porsi|resto|warung/i.test(queryLower);

      if (isPlaceholder && !hasFoodTerms && !args.restaurantName) {
        return {
          draft: null,
          reply: isEn
            ? 'What would you like to eat today? You can tell me the dish or restaurant (e.g. "Order Ayam Taliwang Bu Mirah 2 portions").'
            : 'Ingin memesan makanan apa? Beri tahu menu atau restoran yang Anda inginkan (contoh: "pesen Ayam Taliwang Bu Mirah 2 porsi").',
        };
      }

      const restoName = args.restaurantName || (dbContext.restaurants?.[0]?.name || 'Ayam Taliwang Bu Mirah');
      const matchedResto = dbContext.restaurants?.find((r) =>
        r.name.toLowerCase().includes(restoName.toLowerCase()) ||
        restoName.toLowerCase().includes(r.name.toLowerCase())
      ) || dbContext.restaurants?.[0];
      const merchantId = matchedResto?.id || null;
      const deliveryAddress = args.deliveryAddress || 'Kuta Lombok';
      const destLoc = resolveLombokLocation(deliveryAddress);
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
          items: args.items || 'Menu Rekomendasi Pilihan',
          destination: destLoc.name,
          notes: args.notes || 'Antar hangat',
          destCoords: { lat: destLoc.lat, lng: destLoc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `I drafted your WiraFood order from ${restoName} (${args.items || 'Food items'}). Estimated total is Rp ${priceEstimate.toLocaleString('id-ID')}. Check the draft below and confirm to dispatch!`
        : `Draf pesanan WiraFood Anda dari ${restoName} (${args.items || 'Menu pilihan'}) telah siap dengan estimasi total Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi di bawah untuk langsung memesan!`;
      break;
    }

    case 'draftSendBooking': {
      const originRaw = (args.origin || '').trim();
      const destRaw = (args.destination || '').trim();
      const isPlaceholder = /belum|unknown|tbd|tidak tahu|tidak ada/i.test(originRaw + destRaw);
      const hasSpecifics = queryLower.match(/(?:ke|tujuan|menuju|dari|jemput)/i) ||
        /kuta|bandara|lop|praya|mataram|senggigi|aan|belanak|mandalika/i.test(queryLower);

      if (!originRaw || !destRaw || isPlaceholder || (!hasSpecifics && originRaw.toLowerCase() === destRaw.toLowerCase())) {
        return {
          draft: null,
          reply: isEn
            ? 'What would you like to send and where should it go? (e.g. "Send package from Kuta to Mataram")'
            : 'Mau kirim barang apa dan dari mana ke mana? Beri tahu lokasi jemput dan tujuan paket (contoh: "kirim paket dari Kuta ke Mataram").',
        };
      }

      const originLoc = resolveLombokLocation(originRaw);
      const destLoc = resolveLombokLocation(destRaw);
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
          packageType: args.packageType || 'Paket / Dokumen',
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
      const vRaw = (args.villaName || '').trim();
      const isPlaceholder = !vRaw || /belum|unknown|tbd|villa apa/i.test(vRaw);
      const hasVillaSpecifics = queryLower.match(/(?:villa|vila)\s+([a-zA-Z0-9\s]+)/i) ||
        /talas|segara|malam|inap|nginep/i.test(queryLower);

      if (isPlaceholder && !hasVillaSpecifics) {
        return {
          draft: null,
          reply: isEn
            ? 'Which villa would you like to book and for how many nights? (e.g. "Book a room at Villa Talas for 2 nights")'
            : 'Mau sewa villa apa dan untuk berapa malam? Beri tahu nama villa dan durasi menginap Anda (contoh: "sewa kamar di Villa Talas buat 2 malam").',
        };
      }

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
      const isHousekeeping = args.subType === 'housekeeping';
      const addr = args.address || 'Kuta Lombok';
      const loc = resolveLombokLocation(addr);
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
          subType: args.subType || 'sampah',
          address: loc.name,
          date: args.date || (isEn ? 'Scheduled as requested' : 'Sesuai jadwal'),
          time: args.time || 'Pagi / Jam kerja',
          notes: args.notes || 'Layanan terverifikasi Sampun Bersih',
          destCoords: { lat: loc.lat, lng: loc.lng },
        },
        priceEstimate,
        paymentMethod: 'cash',
        status: 'draft',
      };

      reply = isEn
        ? `Draf for WiraBersih (${label}) has been prepared at ${loc.name}. Cost: Rp ${priceEstimate.toLocaleString('id-ID')}. Confirm below to lock in the schedule!`
        : `Draf pesanan WiraBersih (${label}) untuk lokasi ${loc.name} telah disiapkan dengan tarif Rp ${priceEstimate.toLocaleString('id-ID')}. Silakan konfirmasi untuk menjadwalkan petugas!`;
      break;
    }

    case 'draftPoolBooking': {
      const addr = args.address || 'Kuta Lombok';
      const loc = resolveLombokLocation(addr);
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
      const isSpecific = isExcavator || /ac|cuci ac|listrik|pipa|kulkas|pompa/i.test(queryLower) ||
        (args.serviceCategory && args.serviceCategory !== 'ac' && args.serviceCategory !== 'service') ||
        (args.problemDescription && !/servis|perbaikan/i.test(args.problemDescription));

      if (!isSpecific && /teknisi|tukang/i.test(queryLower) && !/ac|listrik|pipa|kulkas|pompa|excavator/i.test(queryLower)) {
        return {
          draft: null,
          reply: isEn
            ? 'What kind of repair or service do you need? We provide AC servicing, electrical, plumbing, and mini excavator rental (e.g. "Call AC technician tomorrow morning").'
            : 'Butuh teknisi atau alat apa? Kami melayani servis AC, perbaikan pipa/listrik, hingga sewa excavator mini di Lombok (contoh: "panggil tukang AC besok pagi" atau "sewa excavator mini di Praya").',
        };
      }

      const addr = args.address || (isExcavator ? 'Praya, Lombok Tengah' : 'Kuta Lombok');
      const loc = resolveLombokLocation(addr);
      const priceEstimate = isExcavator ? 250000 : 85000;
      const title = isExcavator ? 'Sewa Excavator Mini PC-50 (WiraService)' : `Servis Teknisi ${args.serviceCategory?.toUpperCase() || 'AC'} (WiraService)`;

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
          serviceCategory: args.serviceCategory || 'ac',
          problemDescription: args.problemDescription || (isExcavator ? 'Sewa Excavator Mini PC-50' : 'Servis & Perbaikan'),
          address: loc.name,
          date: args.date || (isEn ? 'Scheduled' : 'Sesuai jadwal'),
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
      const addr = args.address || 'Kuta Lombok';
      const loc = resolveLombokLocation(addr);
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
    const { message, query: bodyQuery, userId, lang = 'id' } = req.body;
    const rawMessage = message || bodyQuery;
    if (!rawMessage || typeof rawMessage !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const query = rawMessage.trim();
    const queryLower = query.toLowerCase();
    const detectedIntents = detectIntents(queryLower);
    const dbContext = await fetchDbContext(queryLower, userId, detectedIntents);

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

CRITICAL INSTRUCTIONS ON TOOL CALLING VS SLOT-FILLING:
- When the user gives booking or ordering requests (e.g. "pesenin ojek motor ke Pantai Kuta jemput di Bandara sekarang", "pesen Ayam Taliwang Bu Mirah 2 porsi", "sewa kamar di Villa Talas buat 2 malam", "angkut sampah villa", "kuras kolam villa", "sewa excavator mini di Praya", "cari baby sitter jagain balita", "kirim paket dari Kuta ke Mataram"), CALL THE CORRESPONDING TOOL immediately to output the structured booking draft!
- For WiraAsuh requests (e.g. "cari baby sitter jagain balita", "pesan babysitter"), always call draftAsuhBooking immediately (default duration 4 hours, default address Kuta Lombok).
- If the user's intent is broad or essential booking parameters are completely missing (e.g. "mau kirim paket", "pesenin ojek motor dong", "pesen makan dong", "mau sewa villa", "mau panggil teknisi"), DO NOT call any tool and DO NOT invent dummy locations or dishes! Instead, reply conversationally asking the user for the missing details (conversational slot-filling).
- Always be warm, friendly, concise, and knowledgeable about Lombok places.

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
            const { draft, reply } = buildDraftFromToolCall(
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
            return res.json({
              success: true,
              reply: textPart,
              widgets: buildWidgets(queryLower, dbContext, detectedIntents),
            });
          }
        }
      } catch (geminiError) {
        console.warn('Gemini API call failed, falling back to local engine:', geminiError.message);
      }
    }

    // Local Intelligent Engine (Enhanced Semantic Matcher + Local Tool Drafting Fallback)
    const { reply, widgets } = generateLocalResponse(query, queryLower, lang, dbContext, detectedIntents);
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

  return widgets;
}

// Local smart generator for fallback when Gemini is unavailable
function generateLocalResponse(query, queryLower, lang, dbContext, detectedIntents) {
  let reply;
  const isEn = lang === 'en';
  const isBookingQuery = /pesen|pesan|sewa|booking|order|panggil|kuras|angkut|cari baby|titip|kirim/i.test(queryLower);

  // 1. Check if the query is a direct order instruction to synthesize a booking_draft widget locally
  if (isBookingQuery) {
    // 1a. WiraRide
    if (detectedIntents.ride || /ojek|taksi|motor|mobil|jemput|antar/i.test(queryLower)) {
      const isCar = /mobil|car|taksi|taxi/i.test(queryLower);
      const keMatch = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:jemput|dari|sekarang|pagi|siang)|$)/i);
      const dariMatch = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju|sekarang|pagi|siang)|$)/i);

      // Slot-filling: If no destination or origin mentioned at all
      if (!keMatch && !dariMatch && !/kuta|bandara|lop|praya|mataram|senggigi|aan|belanak|mandalika/i.test(queryLower)) {
        reply = isEn
          ? 'Where would you like to be picked up and where are you going? (e.g. "Order a motorbike ride to Kuta Beach pickup at Airport now")'
          : 'Mau dijemput di mana dan tujuannya ke mana? Beri tahu lokasi jemput dan tujuan Anda (contoh: "pesenin ojek motor ke Pantai Kuta jemput di Bandara sekarang").';
        return { reply, widgets: buildWidgets(queryLower, dbContext, detectedIntents) };
      }

      let origin = 'Bandara Internasional Lombok (LOP)';
      let destination = 'Pantai Kuta Lombok';
      if (keMatch && keMatch[1]?.trim()) destination = keMatch[1].trim();
      if (dariMatch && dariMatch[1]?.trim()) origin = dariMatch[1].trim();

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftRideBooking', {
        vehicleType: isCar ? 'car' : 'motor',
        origin,
        destination,
        notes: isEn ? 'Immediate pickup' : 'Jemput sekarang',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1b. WiraFood
    if (detectedIntents.food || /makan|taliwang|puyung|ayam|porsi/i.test(queryLower)) {
      // Slot-filling: If no food item or restaurant mentioned
      if (!/taliwang|puyung|ayam|ikan|nasi|sate|plecing|porsi|resto|warung/i.test(queryLower)) {
        reply = isEn
          ? 'What would you like to eat today? You can tell me the dish or restaurant (e.g. "Order Ayam Taliwang Bu Mirah 2 portions").'
          : 'Ingin memesan makanan apa? Beri tahu menu atau restoran yang Anda inginkan (contoh: "pesen Ayam Taliwang Bu Mirah 2 porsi").';
        return { reply, widgets: buildWidgets(queryLower, dbContext, detectedIntents) };
      }

      let restoName = 'Ayam Taliwang Bu Mirah';
      let items = '2 porsi Ayam Taliwang Bu Mirah';
      if (/puyung|nasi balap/i.test(queryLower)) {
        restoName = 'Nasi Balap Puyung Inaq Esun';
        items = 'Nasi Balap Puyung Spesial';
      } else if (/taliwang/i.test(queryLower)) {
        const pMatch = queryLower.match(/(\d+)\s*porsi/i);
        items = pMatch ? `${pMatch[1]} porsi Ayam Taliwang Bu Mirah` : '2 porsi Ayam Taliwang Bu Mirah';
      }

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftFoodOrder', {
        restaurantName: restoName,
        items,
        deliveryAddress: 'Kuta Lombok',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1c. WiraSend
    if (detectedIntents.send || /kirim|paket|dokumen|barang/i.test(queryLower)) {
      const sendKe = queryLower.match(/(?:ke|tujuan|menuju)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:dari|jemput|sekarang)|$)/i);
      const sendDari = queryLower.match(/(?:dari|jemput(?:\s+di)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:ke|tujuan|menuju)|$)/i);

      if (!sendKe && !sendDari && !/kuta|bandara|praya|mataram|senggigi/i.test(queryLower)) {
        reply = isEn
          ? 'What would you like to send and where should it go? (e.g. "Send package from Kuta to Mataram")'
          : 'Mau kirim barang apa dan dari mana ke mana? Beri tahu lokasi jemput dan tujuan paket (contoh: "kirim paket dari Kuta ke Mataram").';
        return { reply, widgets: buildWidgets(queryLower, dbContext, detectedIntents) };
      }

      const origin = sendDari ? sendDari[1].trim() : 'Kuta Lombok';
      const destination = sendKe ? sendKe[1].trim() : 'Kota Mataram';

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftSendBooking', {
        origin,
        destination,
        packageType: 'Dokumen / Paket Kilat',
        packageSize: 'kecil',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1d. WiraVilla
    if (detectedIntents.villa || /kamar|villa|vila|nginep/i.test(queryLower)) {
      if (!/talas|segara|kuta|malam|inap/i.test(queryLower) && !queryLower.match(/(?:villa|vila)\s+([a-zA-Z0-9\s]+)/i)) {
        reply = isEn
          ? 'Which villa would you like to book and for how many nights? (e.g. "Book a room at Villa Talas for 2 nights")'
          : 'Mau sewa villa apa dan untuk berapa malam? Beri tahu nama villa dan durasi menginap Anda (contoh: "sewa kamar di Villa Talas buat 2 malam").';
        return { reply, widgets: buildWidgets(queryLower, dbContext, detectedIntents) };
      }

      const nightsMatch = queryLower.match(/(\d+)\s*malam/i);
      const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : 2;

      let vName = 'Villa Segara Kuta Lombok';
      if (/talas/i.test(queryLower)) {
        vName = 'Villa Talas';
      } else if (dbContext.villas?.[0]?.name) {
        vName = dbContext.villas[0].name;
      }

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftVillaBooking', {
        villaName: vName,
        nights,
        checkInDate: 'Besok',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1e. WiraBersih
    if (detectedIntents.bersih || /sampah|housekeeping|bersih/i.test(queryLower)) {
      const isHk = /housekeeping|turnover|kamar|bersih villa/i.test(queryLower);
      const { draft, reply: draftReply } = buildDraftFromToolCall('draftBersihBooking', {
        subType: isHk ? 'housekeeping' : 'sampah',
        address: 'Kuta Lombok',
        date: 'Besok pagi',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1f. WiraPool
    if (detectedIntents.pool || /kolam|kuras/i.test(queryLower)) {
      const { draft, reply: draftReply } = buildDraftFromToolCall('draftPoolBooking', {
        serviceCategory: 'Kuras & Vacuum Kolam Renang',
        address: 'Villa Kuta Lombok',
        date: 'Hari ini',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1g. WiraService
    if (detectedIntents.service || detectedIntents.excavator || /ac|teknisi|tukang|excavator|bego|pipa|listrik/i.test(queryLower)) {
      const isExcavator = /excavator|ekskavator|bego|alat berat/i.test(queryLower);

      if (!isExcavator && !/ac|listrik|pipa|kulkas|pompa|bego|alat berat/i.test(queryLower)) {
        reply = isEn
          ? 'What kind of repair or service do you need? We provide AC servicing, electrical, plumbing, and mini excavator rental (e.g. "Call AC technician tomorrow morning").'
          : 'Butuh teknisi atau alat apa? Kami melayani servis AC, perbaikan pipa/listrik, hingga sewa excavator mini di Lombok (contoh: "panggil tukang AC besok pagi" atau "sewa excavator mini di Praya").';
        return { reply, widgets: buildWidgets(queryLower, dbContext, detectedIntents) };
      }

      let addr = isExcavator ? 'Praya, Lombok Tengah' : 'Kuta Lombok';
      if (/praya/i.test(queryLower)) addr = 'Praya, Lombok Tengah';
      else if (/kuta/i.test(queryLower)) addr = 'Kuta Lombok';
      else if (/mataram/i.test(queryLower)) addr = 'Kota Mataram';

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftServiceBooking', {
        serviceCategory: isExcavator ? 'excavator' : 'ac',
        problemDescription: isExcavator ? 'Sewa Excavator Mini PC-50 di Praya' : 'Servis & Cuci AC Villa',
        address: addr,
        date: 'Besok pagi',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }

    // 1h. WiraAsuh
    if (detectedIntents.asuh || /baby\s*sitter|babysitter|asuh|balita|anak/i.test(queryLower)) {
      const hoursMatch = queryLower.match(/(\d+)\s*jam/i);
      const durationHours = hoursMatch ? parseInt(hoursMatch[1], 10) : 4;

      const { draft, reply: draftReply } = buildDraftFromToolCall('draftAsuhBooking', {
        careType: 'Pengasuh Balita & Anak',
        durationHours,
        address: 'Kuta Lombok',
        date: 'Hari ini',
      }, dbContext, lang);

      return { reply: draftReply, widgets: [draft] };
    }
  }

  // Conversational Intent Matching (Info & Recommendations)
  const sortedIntents = Object.entries(detectedIntents).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

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
