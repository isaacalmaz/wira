import API_BASE_URL from '../config/api';
import { supabase } from '../config/supabase';

/**
 * Send a message to Wira AI Assistant.
 * Tries the backend proxy first (which connects to Gemini / tool calling),
 * and falls back gracefully to direct client-side Supabase contextual resolution
 * if the backend is unreachable.
 */
export async function sendAssistantMessage({ message, userId, lang = 'id', activeOrders = [] }) {
  if (!message || !message.trim()) return null;

  const query = message.trim();
  const queryLower = query.toLowerCase();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: query, userId, lang }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.reply) {
        return {
          reply: data.reply,
          widgets: data.widgets || [],
        };
      }
    }
  } catch (err) {
    console.warn('Backend assistant endpoint unavailable, using client fallback:', err.message);
  }

  // Client-side fallback with real Supabase data
  return await resolveClientAssistant({ query, queryLower, lang, activeOrders });
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

async function resolveClientAssistant({ queryLower, lang, activeOrders = [] }) {
  const isEn = lang === 'en';
  let reply;
  const widgets = [];
  const detectedIntents = detectIntents(queryLower);
  const sortedIntents = Object.entries(detectedIntents).sort((a, b) => b[1] - a[1]);
  const primaryIntent = sortedIntents[0]?.[0];

  // 1. Villa Intent
  if (primaryIntent === 'villa') {
    try {
      // Check if specific name mentioned
      const stopWords = new Set(['villa', 'vila', 'cari', 'yang', 'dengan', 'pantai', 'inap', 'nginep', 'sewa', 'booking', 'rekomendasi', 'lombok', 'kuta']);
      const words = queryLower.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
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

  // 2. Food Intent
  else if (primaryIntent === 'food') {
    try {
      const foodStopWords = new Set(['makan', 'food', 'kuliner', 'lapar', 'laper', 'ayam', 'ikan', 'nasi', 'resto', 'restoran', 'warung', 'kuta', 'lombok']);
      const foodWords = queryLower.split(/\s+/).filter(w => w.length > 3 && !foodStopWords.has(w));
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
