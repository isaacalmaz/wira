// =========================================
// Display-time localization for text that comes FROM the database.
//
// Everything written to `orders` and `transactions` stays Indonesian on
// purpose: drivers, merchants, technicians and admins read those rows in
// their own portals. This module only changes how the customer's screen
// renders them, by recognising the exact templates the code writes and
// re-rendering them through the dictionary.
//
// Rule for every function here: if a string does not match a known template,
// return the raw DB text unchanged. Nothing may ever disappear.
//
// Write sites mirrored here:
//   orders.title        RidePage, SendPage, ServicePage, PoolPage
//                       (food = restaurant name, villa = villa name: data)
//   orders.details      SendPage, VillaPage, ServicePage, PoolPage,
//                       RestaurantPage (ride = JSON, parsed separately)
//   transactions        create_order_and_pay (paymentDescription from each
//                       booking page), approve_topup_request (0015/0021),
//                       backend/routes/mutasiku.js + midtrans.js,
//                       wallet_transfer (0023), submit_review_and_tip (0041),
//                       wallet_refund* (0040/0061/ActiveOrderPage),
//                       admin_wallet_correction (0062), QRIS order
//                       settlement (0083)
// =========================================

// ---------- lookup tables: Indonesian value written -> dictionary key ----------

// ServicePage `categories[].name`
const SERVICE_NAME_KEYS = {
  'Service AC & Cuci': 'service.categories.AC',
  'Instalasi Listrik': 'service.categories.Listrik',
  'Pipa & Pompa Air': 'service.categories.Plumbing',
  'Tukang Bangunan': 'service.categories.Tukang',
};

// PoolPage `services[].name` and `monthlyPackage.name`
const POOL_NAME_KEYS = {
  'Pembersihan Rutin': 'pool.services.S1',
  'Treatment Air & Klorinasi': 'pool.services.S2',
  'Servis Pompa & Filter Kolam': 'pool.services.S3',
  'Paket Langganan Kolam Bulanan': 'pool.monthly_name',
};

// SendPage `packages[].name`
const PACKAGE_NAME_KEYS = {
  'Dokumen': 'send.packages.dokumen',
  'Paket Kecil': 'send.packages.kecil',
  'Paket Sedang': 'send.packages.sedang',
  'Paket Besar': 'send.packages.besar',
};

// PoolPage pool-size <option> values
const POOL_SIZE_KEYS = {
  'Kecil (< 20 m²)': 'pool.size_small',
  'Sedang (20-50 m²)': 'pool.size_medium',
  'Besar (> 50 m²)': 'pool.size_large',
};

// Product labels the earlier Pulsa checkout wrote into payment descriptions
// ("{tab} {label} ({target})"). Matched case-insensitively.
const PULSA_LABEL_KEYS = {
  'pulsa 10.000': 'pulsa.products.P10',
  'pulsa 20.000': 'pulsa.products.P20',
  'pulsa 50.000': 'pulsa.products.P50',
  'pulsa 50.000 (populer)': 'pulsa.products.P50',
  'pulsa 100.000': 'pulsa.products.P100',
  'pulsa 150.000': 'pulsa.products.P150',
  'pulsa 200.000': 'pulsa.products.P200',
  '5gb / 30 hari': 'pulsa.products.D1',
  '15gb unlimited / 30 hari': 'pulsa.products.D2',
  '35gb jumbo / 30 hari': 'pulsa.products.D3',
  '60gb bebas kuota / 30 hari': 'pulsa.products.D4',
  'token listrik 20.000': 'pulsa.products.PLN20',
  'token listrik 50.000': 'pulsa.products.PLN50',
  'token listrik 100.000': 'pulsa.products.PLN100',
  'token listrik 200.000': 'pulsa.products.PLN200',
  'token listrik 500.000': 'pulsa.products.PLN500',
  'token listrik 1.000.000': 'pulsa.products.PLN1000',
  'tagihan air pdam giri menang': 'pulsa.products.PDAM1',
  'iuran bpjs kelas 3 (2 jiwa)': 'pulsa.products.BPJS1',
  'iuran bpjs kelas 2 (1 jiwa)': 'pulsa.products.BPJS2',
};

const lookup = (table, value, t) => {
  const key = table[typeof value === 'string' ? value.trim() : value];
  return key ? t(key) : value;
};

// ---------- orders ----------

const SERVICE_BRAND = {
  ride: 'WiraRide', food: 'WiraFood', send: 'WiraSend', villa: 'WiraVilla',
  service: 'WiraService', pool: 'WiraPool', pulsa: 'WiraPulsa',
};

/**
 * Customer-facing title for an order row (raw DB row or the OrderContext UI
 * shape). Falls back to the raw title, then to a generic "{Service} order".
 */
export function localizeOrderTitle(order, t) {
  const raw = typeof order?.title === 'string' ? order.title.trim() : '';
  const serviceType = order?.service_type;

  if (raw) {
    let m = raw.match(/^Perjalanan ke (.+)$/);
    if (m) return t('order_text.ride_title', { place: m[1] });

    m = raw.match(/^Kirim Paket ke (.+)$/);
    if (m) return t('order_text.send_title', { name: m[1] });

    if (SERVICE_NAME_KEYS[raw]) return t(SERVICE_NAME_KEYS[raw]);
    if (POOL_NAME_KEYS[raw]) return t(POOL_NAME_KEYS[raw]);

    // food = restaurant name, villa = villa name: merchant data, left as is.
    return raw;
  }

  const service = order?.service || SERVICE_BRAND[serviceType] || 'Wira';
  return t('activity.default_title', { service });
}

/**
 * Customer-facing one-line details for an order. Ride orders store JSON
 * with pickup/dropoff; every other service stores one of the templates below.
 */
export function localizeOrderDetails(order, t) {
  const raw = typeof order?.details === 'string' ? order.details : '';
  if (!raw) return '';

  // WiraRide: JSON { pickup: {name}, dropoff: {name}, route }
  if (raw.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.pickup && parsed?.dropoff) {
        return `${parsed.pickup.name || t('activity.route_pickup')} ➔ ${parsed.dropoff.name || t('activity.route_dropoff')}`;
      }
    } catch {
      // not JSON after all: fall through to the text templates
    }
  }

  // SendPage: `No. Resi: ${resi} • ${pkg} (${from} ➔ ${to})`
  let m = raw.match(/^No\. Resi: (\S+) • (.+?) \((.+) ➔ (.+)\)$/s);
  if (m) {
    return t('order_text.send_detail', {
      resi: m[1], package: lookup(PACKAGE_NAME_KEYS, m[2], t), from: m[3], to: m[4],
    });
  }

  // VillaPage: `Kode: ${code} • ${nights} Malam (${checkIn}) • ${guests} Tamu`
  m = raw.match(/^Kode: (\S+) • (\d+) Malam \(([^)]*)\) • (\d+) Tamu$/);
  if (m) {
    return t('order_text.villa_detail', { code: m[1], nights: m[2], date: m[3], guests: m[4] });
  }

  // ServicePage: `Teknisi: ${name} • Jadwal: ${date} pukul ${time} • Lokasi: ${address}`
  m = raw.match(/^Teknisi: (.+?) • Jadwal: (\S+) pukul (\S+) • Lokasi: (.+)$/s);
  if (m) {
    return t('order_text.service_detail', { tech: m[1], date: m[2], time: m[3], address: m[4] });
  }

  // PoolPage: `Ukuran: ${size} • Lokasi: ${address} • Kunjungan: ${date}`
  m = raw.match(/^Ukuran: (.+?) • Lokasi: (.+) • Kunjungan: (\S+)$/s);
  if (m) {
    return t('order_text.pool_detail', { size: lookup(POOL_SIZE_KEYS, m[1], t), address: m[2], date: m[3] });
  }

  // RestaurantPage: `${itemsSummary} — Antar ke: ${address}`
  m = raw.match(/^(.+) — Antar ke: (.+)$/s);
  if (m) {
    return t('order_text.food_detail', { items: m[1], address: m[2] });
  }

  return raw;
}

// ---------- transactions ----------

/**
 * Payment descriptions: what each booking page passes as
 * `paymentDescription` to create_order_and_pay, plus the SQL-side ones.
 * Returns { title, detail } or null if the shape is unknown.
 */
function localizePaymentDescription(desc, t) {
  let m;

  // QRIS order settlement (0083): 'Pembayaran QRIS: ' || order title
  m = desc.match(/^Pembayaran QRIS: (.*)$/s);
  if (m) {
    const orderTitle = m[1].trim() === 'Pesanan' || !m[1].trim()
      ? t('ledger.order_fallback')
      : localizeOrderTitle({ title: m[1] }, t);
    return { title: t('ledger.payment_qris'), detail: orderTitle };
  }

  // Tip (0041): 'Tip untuk Driver (Order <uuid>)'
  if (/^Tip untuk Driver\b/.test(desc)) return { title: t('ledger.tip_out'), detail: null };

  // SendPage: `WiraSend Paket ke ${receiverName}` (checked before the generic "ke")
  m = desc.match(/^WiraSend Paket ke (.+)$/s);
  if (m) return { title: t('ledger.payment_send', { name: m[1] }), detail: null };

  // RidePage and the generic "{Service} ke {place}" shape
  m = desc.match(/^(Wira[A-Za-z]+) ke (.+)$/s);
  if (m) return { title: t('ledger.payment_to', { service: m[1], place: m[2] }), detail: null };

  // VillaPage: `Reservasi Villa ${name}`
  m = desc.match(/^Reservasi Villa (.+)$/s);
  if (m) return { title: t('ledger.payment_villa', { name: m[1] }), detail: null };

  // ServicePage / PoolPage / RestaurantPage: `WiraX - ${name}`
  m = desc.match(/^(WiraService|WiraPool|WiraFood) - (.+)$/s);
  if (m) {
    const [, brand, name] = m;
    const label = brand === 'WiraService'
      ? lookup(SERVICE_NAME_KEYS, name, t)
      : brand === 'WiraPool'
        ? lookup(POOL_NAME_KEYS, name, t)
        : name; // restaurant name: data
    return { title: t('ledger.payment_brand', { service: brand, item: label }), detail: null };
  }

  // Earlier Pulsa checkout: `${tab} ${label} (${target})`
  m = desc.match(/^(Pulsa|Data|PLN|PDAM|BPJS) (.+) \(([^()]+)\)$/s);
  if (m) {
    const productKey = PULSA_LABEL_KEYS[m[2].trim().toLowerCase()];
    // The product list tags one item "(populer)"; that badge has no place on a receipt.
    const product = productKey ? t(productKey).replace(/\s*\((populer|popular)\)$/i, '') : m[2];
    return { title: t('ledger.payment_pulsa', { product, target: m[3] }), detail: null };
  }

  // SQL default (0023/0070)
  if (desc === 'Pembayaran Layanan') return { title: t('ledger.payment'), detail: null };

  return null;
}

/**
 * Customer-facing { title, detail } for one `transactions` row.
 * `tx.type` is the raw DB type; `tx.description` the raw DB text.
 * The title is driven by the type wherever the type alone says enough.
 */
export function localizeTransaction(tx, t) {
  const type = tx?.type;
  const desc = typeof tx?.description === 'string' ? tx.description.trim() : '';
  const fallback = { title: desc || t('ledger.unknown'), detail: null };

  switch (type) {
    case 'topup': {
      // 'Top Up QRIS Statis[ DANA]' (0015/0021), '... via QRIS (verifikasi
      // otomatis Mutasiku)' / '(Recovery Mutasiku Rp ...)' (mutasiku.js),
      // '... via Midtrans' (midtrans.js). The channel is the only useful detail.
      let detail = null;
      if (/midtrans/i.test(desc)) detail = t('ledger.via_midtrans');
      else if (/qris|mutasiku/i.test(desc)) detail = t('ledger.via_qris');
      return { title: t('ledger.topup'), detail };
    }

    case 'payment': {
      return localizePaymentDescription(desc, t) || { title: desc || t('ledger.payment'), detail: null };
    }

    case 'refund': {
      // 'Refund Layanan' (0040), 'Refund Pembatalan Perjalanan' (0061),
      // 'Refund Batal Pelanggan (Dalam Grace Period)' (ActiveOrderPage)
      const detail = /batal|pembatalan/i.test(desc) ? t('ledger.refund_cancelled') : null;
      return { title: t('ledger.refund'), detail };
    }

    case 'transfer': {
      // Outgoing (0023): COALESCE(p_description, 'Transfer ke ' || name/phone)
      const m = desc.match(/^Transfer ke (.+)$/s);
      if (m) return { title: t('ledger.transfer_to', { name: m[1] }), detail: null };
      return { title: t('ledger.transfer_out'), detail: desc || null };
    }

    case 'transfer_in': {
      // 'Transfer dari ' || name (0023), 'Tip dari Pelanggan (Order ...)' (0041)
      if (/^Tip dari Pelanggan\b/.test(desc)) return { title: t('ledger.tip_in'), detail: null };
      const m = desc.match(/^Transfer dari (.+)$/s);
      if (m) {
        const name = m[1] === 'Pengguna Wira' ? t('nav.guest_name') : m[1];
        return { title: t('ledger.transfer_from', { name }), detail: null };
      }
      return { title: t('ledger.transfer_in'), detail: desc || null };
    }

    case 'correction_in':
    case 'correction_out': {
      // 'KOREKSI ADMIN: ' || note (0062). The note is the admin's own record,
      // so it is shown verbatim; only the fixed prefix/default are ours.
      let note = desc.replace(/^KOREKSI ADMIN:\s*/i, '');
      if (note === '(tanpa catatan)') note = t('ledger.no_note');
      return {
        title: t(type === 'correction_in' ? 'ledger.correction_in' : 'ledger.correction_out'),
        detail: note || null,
      };
    }

    default:
      return fallback;
  }
}

/**
 * Label for orders.payment_method ('wallet' | 'cash' | 'transfer' | 'qris',
 * see toDbPaymentMethod and migrations/0077). Unknown values pass through.
 */
export function localizePaymentMethod(order, t) {
  const raw = order?.payment_method || order?.paymentMethod;
  switch (String(raw || '').toLowerCase()) {
    case 'wallet':
    case 'wirapay':
      return t('order_text.method_wallet');
    case 'cash':
    case 'tunai':
      return t('common.pay_cash');
    case 'qris':
      return t('common.pay_qris');
    case 'transfer':
      return t('order_text.method_transfer');
    default:
      return raw || t('order_text.method_wallet');
  }
}
