// Database/driver wording ("violates foreign key constraint", "Cannot
// coerce the result to a single JSON object", "Failed to fetch") means
// nothing to a customer. Messages written for people - the Indonesian
// RAISE EXCEPTION texts in our SQL - pass through unchanged.
const TECHNICAL = /violates|constraint|permission denied|function |relation |column |JSON|coerce|PGRST|syntax|null value|duplicate key|uuid|AuthApiError/i;
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|timed? ?out/i;

export function friendlyError(err, fallback = 'Terjadi kendala. Coba lagi sebentar lagi, atau hubungi CS lewat Pusat Bantuan.') {
  const msg = String(err?.message || err || '').trim();
  if (!msg) return fallback;
  if (NETWORK.test(msg)) return 'Koneksi terputus. Periksa internet Anda, lalu coba lagi.';
  if (/invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.';
  if (TECHNICAL.test(msg)) return fallback;
  return msg;
}
