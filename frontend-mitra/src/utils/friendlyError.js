// Database/driver wording never reaches partners; messages written for
// people (the Indonesian RAISE EXCEPTION texts in our SQL) pass through.
const TECHNICAL = /violates|constraint|permission denied|function |relation |column |JSON|coerce|PGRST|syntax|null value|duplicate key|uuid|AuthApiError/i;
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|timed? ?out/i;

export function friendlyError(err, fallback = 'Terjadi kendala. Coba lagi sebentar lagi, atau hubungi admin lewat menu Bantuan.') {
  const msg = String(err?.message || err || '').trim();
  if (!msg) return fallback;
  if (NETWORK.test(msg)) return 'Koneksi terputus. Periksa internet Anda, lalu coba lagi.';
  if (/invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(msg)) return 'Email Anda belum dikonfirmasi. Buka email dari Wira (cek juga folder Spam) lalu ketuk tautan konfirmasinya.';
  if (TECHNICAL.test(msg)) return fallback;
  return msg;
}
