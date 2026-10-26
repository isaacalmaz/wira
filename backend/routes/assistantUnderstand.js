// POST /api/assistant/understand
//
// Structured Intent Understanding Endpoint.
// Extracts user intent, parameters (service, vehicle, pickup, dropoff, timing mode, notes)
// and landmark hints. It NEVER invents coordinates, distances or prices.
// All geographic resolution, routing, and pricing are calculated factually by the app.
const fetch = require('node-fetch');

const SERVICES = ['ride', 'food', 'send', 'villa', 'bersih', 'pool', 'service', 'asuh', 'track_order', 'chitchat', 'other'];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    service: { type: 'STRING', enum: SERVICES },
    ride: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        vehicle: { type: 'STRING', enum: ['motor', 'mobil'], nullable: true },
        pickupText: { type: 'STRING', nullable: true, description: 'Explicit pickup place name (e.g. Lombok Epicentrum Mall, KUA Pujut). Null if user refers to current location or did not specify origin.' },
        pickupIsCurrentLocation: { type: 'BOOLEAN', description: 'True if user requested pickup at current location (tempat saya, lokasi saya, sini, jemput saya, or no origin specified for immediate ride).' },
        pickupLandmarkNote: { type: 'STRING', nullable: true, description: 'Landmark / spot note e.g. dekat gerbang keluar, depan masjid, pagar hijau, lobi timur.' },
        dropoffText: { type: 'STRING', nullable: true, description: 'Dropoff / destination place name (e.g. TEMU Coffee, Bandara Lombok, Pantai Kuta).' },
        dropoffLandmarkNote: { type: 'STRING', nullable: true, description: 'Dropoff landmark note if any.' },
        timingMode: { type: 'STRING', enum: ['now', 'later', 'hourly'], description: 'now for immediate, later for scheduled (nanti), hourly for rental per jam.' },
        timingRelativeMinutes: { type: 'INTEGER', nullable: true, description: 'Minutes from now, e.g. 300 for dalam 5 jam ke depan, 60 for 1 jam lagi.' },
        timingLocalDateTime: { type: 'STRING', nullable: true, description: 'Target date/time in YYYY-MM-DDTHH:mm format in WITA (UTC+8).' },
        timingHours: { type: 'INTEGER', nullable: true, description: 'Rental hours for hourly rental mode (e.g. 4 for sewa mobil 4 jam).' },
        notes: { type: 'STRING', nullable: true },
      },
    },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
    clarifyQuestion: { type: 'STRING', nullable: true },
  },
  required: ['service'],
};

function witaNow() {
  const now = new Date();
  const wita = new Date(now.getTime() + 8 * 3600 * 1000);
  const iso = wita.toISOString().slice(0, 16);
  const day = wita.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'UTC' });
  return { iso, day };
}

function clean(str, max = 160) {
  if (typeof str !== 'string') return null;
  const s = str.trim().slice(0, max);
  return s || null;
}

function sanitize(raw) {
  const service = SERVICES.includes(raw?.service) ? raw.service : 'other';
  const out = {
    service,
    missing: Array.isArray(raw?.missing) ? raw.missing.map(String) : [],
    clarifyQuestion: clean(raw?.clarifyQuestion, 300),
    ride: null,
  };

  if (raw?.ride && typeof raw.ride === 'object') {
    const r = raw.ride;
    const mode = ['now', 'later', 'hourly'].includes(r.timingMode) ? r.timingMode : 'now';
    const rel = Number.isFinite(Number(r.timingRelativeMinutes)) ? Math.round(Number(r.timingRelativeMinutes)) : null;
    const hours = Number.isFinite(Number(r.timingHours)) ? Math.round(Number(r.timingHours)) : null;
    const local = typeof r.timingLocalDateTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.timingLocalDateTime)
      ? r.timingLocalDateTime.slice(0, 16) : null;

    out.ride = {
      vehicle: ['motor', 'mobil'].includes(r.vehicle) ? r.vehicle : null,
      pickupText: clean(r.pickupText),
      pickupIsCurrentLocation: Boolean(r.pickupIsCurrentLocation),
      pickupLandmarkNote: clean(r.pickupLandmarkNote),
      dropoffText: clean(r.dropoffText),
      dropoffLandmarkNote: clean(r.dropoffLandmarkNote),
      timingMode: mode,
      timingRelativeMinutes: rel != null && rel >= 0 && rel <= 60 * 24 * 30 ? rel : null,
      timingLocalDateTime: local,
      timingHours: hours != null && hours > 0 && hours <= 48 ? hours : null,
      notes: clean(r.notes, 200),
    };
  }

  return out;
}

// Fallback rule parser when Gemini is unreachable
function parseRuleFallback(message) {
  const q = (message || '').trim().toLowerCase();
  const isRide = /ride|ojek|taksi|motor|mobil|jemput|antar|sewa mobil|transport|pesankan/i.test(q) || /(?:dari\s+.+\s+ke\s+|ke\s+)/i.test(q);
  if (!isRide) return { service: 'other', missing: [], clarifyQuestion: null, ride: null };

  const isCar = /mobil|car|taksi|taxi/i.test(q);
  const isMotor = /motor|ojek|bike/i.test(q);
  const vehicle = isCar ? 'mobil' : (isMotor ? 'motor' : null);

  // Timing
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

  // Self location check
  const isSelf = /tempat saya|lokasi saya|posisi saya|sini|jemput saya/i.test(q);

  // Extract from / ke
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
    if (/tempat saya|lokasi saya|sini/i.test(raw)) {
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
    service: 'ride',
    missing: !dropoffText && timingMode !== 'hourly' ? ['dropoff'] : [],
    clarifyQuestion: null,
    ride: {
      vehicle,
      pickupText,
      pickupIsCurrentLocation: isSelf || !pickupText,
      pickupLandmarkNote,
      dropoffText,
      dropoffLandmarkNote,
      timingMode,
      timingRelativeMinutes,
      timingLocalDateTime: null,
      timingHours,
      notes: null,
    }
  };
}

module.exports = async function understand(req, res) {
  try {
    const { message, lang = 'id', pending = null, history = [] } = req.body || {};
    if (!message || typeof message !== 'string' || message.length > 1000) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      return res.json({ success: true, intent: parseRuleFallback(message), source: 'fallback_rules' });
    }

    const { iso, day } = witaNow();
    const recent = (Array.isArray(history) ? history : [])
      .slice(-6)
      .map((h) => `${h?.sender === 'user' ? 'User' : 'Wira AI'}: ${String(h?.text || '').slice(0, 300)}`)
      .join('\n');

    const prompt = `You extract structured booking intent for "Wira", a super-app in Lombok, Indonesia.
Services: ride (ojek/motor, mobil/taksi, jemput, antar, sewa mobil per jam), food, send (kirim paket), villa, bersih (kebersihan/sampah), pool (kolam), service (teknisi AC/listrik/excavator), asuh (babysitter), track_order (status pesanan), chitchat, other.

Current time: ${day}, ${iso} WITA (UTC+8).

Rules:
- Only extract what the user said. NEVER invent places, coordinates, distances or prices.
- "jemput di tempat saya", "dari sini", "lokasi saya" => pickupIsCurrentLocation = true, pickupText = null.
- If user provides an explicit pickup place (e.g. 'epicentrum', 'KUA Pujut'), set pickupText and pickupIsCurrentLocation = false.
- Split landmark notes inside parentheses or descriptive phrases: "epicentrum (dekat gerbang keluar)" => pickupText: "Lombok Epicentrum Mall", pickupLandmarkNote: "dekat gerbang keluar".
- Destination: "mnuju temu coffeshop" -> dropoffText: "TEMU Coffee & Space". Keep place names recognizable.
- Timing: "sekarang" or default => timingMode: "now". "dalam 5 jam", "5 jam lagi" => timingMode: "later", timingRelativeMinutes: 300. "sewa mobil 4 jam" => timingMode: "hourly", timingHours: 4.
- vehicle: "mobil", "taksi", "car" => "mobil"; "motor", "ojek" => "motor"; null if unspecified.
${pending ? `\nPending intent from previous turn: ${JSON.stringify(pending).slice(0, 1000)}` : ''}
${recent ? `\nRecent conversation:\n${recent}` : ''}

User language: ${lang === 'en' ? 'English' : 'Indonesian'}.
User message: ${message}`;

    // Try primary model (gemini-3.5-flash-lite), with quick fallback to gemini-3.5-flash
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
    let geminiParsed = null;

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 600,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
              },
            }),
          }
        );
        clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
          if (text) {
            geminiParsed = JSON.parse(text);
            break;
          }
        }
      } catch (err) {
        console.warn(`Gemini model ${model} failed, trying next:`, err.message);
      }
    }

    if (geminiParsed) {
      return res.json({ success: true, intent: sanitize(geminiParsed), source: 'gemini' });
    }

    // Graceful fallback to rule parser
    return res.json({ success: true, intent: parseRuleFallback(message), source: 'fallback_rules' });
  } catch (err) {
    console.warn('assistant/understand failed:', err.message);
    return res.json({ success: true, intent: parseRuleFallback(req.body?.message), source: 'fallback_rules' });
  }
};

module.exports.sanitize = sanitize;
module.exports.parseRuleFallback = parseRuleFallback;
