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
    'sampun bersih', 'sampun', 'pembuangan', 'kebersihan villa', 'sapu'
  ],
  service: [
    'ac', 'cuci ac', 'ac panas', 'ac bocor', 'pipa', 'listrik', 'rusak', 'benerin', 'servis',
    'service', 'teknisi', 'tukang', 'kulkas', 'pompa air'
  ],
  asuh: [
    'babysitter', 'asuh', 'jaga anak', 'titip anak', 'pengasuh', 'suster', 'balita', 'baby'
  ],
  tracking: [
    'order', 'pesanan', 'status', 'lacak', 'posisi', 'driver', 'sudah sampai mana', 'kapan sampai',
    'cek order', 'cek pesanan'
  ],
  payment: [
    'bayar', 'pembayaran', 'qris', 'tunai', 'cash', 'cara bayar', 'batal', 'cancel', 'bantuan', 'cs', 'wirapay', 'saldo'
  ]
};

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
  // If user mentions 'kolam' or 'sampah' in their 'villa', pool/bersih takes priority over villa rental
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
    // 1. Fetch Villas ONLY if villa intent is detected and primary
    if (detectedIntents.villa) {
      let villaQuery = supabase
        .from('merchants')
        .select('id, name, address, rating, price_per_night, photos, is_open')
        .eq('service_type', 'villa')
        .eq('listing_status', 'approved');

      // Check if specific name mentioned
      const stopWords = new Set(['villa', 'vila', 'cari', 'yang', 'dengan', 'pantai', 'inap', 'nginep', 'sewa', 'booking', 'rekomendasi', 'lombok', 'kuta']);
      const words = queryLower.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
      for (const w of words) {
        const { data: specific } = await supabase
          .from('merchants')
          .select('id, name, address, rating, price_per_night, photos')
          .eq('service_type', 'villa')
          .ilike('name', `%${w}%`)
          .limit(2);
        if (specific && specific.length > 0) {
          context.villas = specific.map(v => ({
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
        const { data: villas } = await villaQuery.limit(3);
        if (villas && villas.length > 0) {
          context.villas = villas.map(v => ({
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

    // 2. Fetch Food / Restaurants if food intent
    if (detectedIntents.food) {
      // Check if specific food merchant name mentioned
      const foodStopWords = new Set(['makan', 'food', 'kuliner', 'lapar', 'laper', 'ayam', 'ikan', 'nasi', 'resto', 'restoran', 'warung', 'kuta', 'lombok']);
      const foodWords = queryLower.split(/\s+/).filter(w => w.length > 3 && !foodStopWords.has(w));
      for (const w of foodWords) {
        const { data: specificFood } = await supabase
          .from('merchants')
          .select('id, name, address, rating, image, photos, is_open, category')
          .eq('service_type', 'food')
          .ilike('name', `%${w}%`)
          .limit(2);
        if (specificFood && specificFood.length > 0) {
          context.restaurants = specificFood.map(f => ({
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
          context.restaurants = foods.map(f => ({
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
        .select('id, service_type, status, driver_id, destination_address, created_at')
        .eq('customer_id', userId)
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

// POST /api/assistant/chat
router.post('/chat', assistantLimiter, async (req, res) => {
  try {
    const { message, userId, lang = 'id' } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const query = message.trim();
    const queryLower = query.toLowerCase();
    const detectedIntents = detectIntents(queryLower);
    const dbContext = await fetchDbContext(queryLower, userId, detectedIntents);

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

    // If Gemini API Key is available, call Google Gemini 2.0 Flash
    if (apiKey) {
      try {
        const systemPrompt = `You are "Wira AI Assistant", an expert local concierge and booking assistant for the Wira Super-App in Lombok, Indonesia.
Wira provides on-demand services:
- WiraRide: motorbike & car ride hailing in Lombok (Kuta, Bandara LOP, Mataram, Senggigi, etc.). Note: payments are Cash & QRIS (WiraPay wallet is deactivated).
- WiraFood: food delivery for local culinary favorites (Ayam Taliwang, Nasi Balap Puyung, seafood).
- WiraSend: on-demand parcel and package delivery.
- WiraVilla: private villa rentals with private pools and ocean views in Lombok.
- WiraBersih: villa housekeeping and routine waste management (Sampun Bersih in Kuta Lombok).
- WiraPool: swimming pool maintenance, water testing & chemical balance.
- WiraService: technician repairs (AC repair, plumbing) and Excavator / Heavy Equipment rental in Lombok.
- WiraAsuh: trusted babysitter and nanny services for homes and villas.

Language: Respond in ${lang === 'en' ? 'English' : 'Indonesian'}.
Tone: Friendly, concise, warm, helpful, and culturally knowledgeable about Lombok.

Real Database Context available right now:
${JSON.stringify(dbContext)}

Return a concise response. If relevant, mention that interactive cards are provided below for 1-tap booking or tracking.`;

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
            generationConfig: {
              maxOutputTokens: 600,
              temperature: 0.7,
            },
          }),
        });

        if (response.ok) {
          const geminiData = await response.json();
          const parts = geminiData.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find((p) => p.text)?.text;
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

    // Local Intelligent Engine (Enhanced Semantic Matcher)
    const { reply, widgets } = generateLocalResponse(queryLower, lang, dbContext, detectedIntents);
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

// Generate appropriate rich widgets based on query and context
function buildWidgets(queryLower, dbContext, detectedIntents) {
  const widgets = [];
  const sortedIntents = Object.entries(detectedIntents || {}).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

  // Villa Widgets - ONLY if villa is detected and not overridden by specific services
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

  // Food Widgets - ONLY if food intent is detected
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

// Local smart generator for fallback
function generateLocalResponse(queryLower, lang, dbContext, detectedIntents) {
  let reply;
  const isEn = lang === 'en';

  // Sort intents by score
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
