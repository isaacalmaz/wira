require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Vercel terminates the connection and forwards the real client IP in
// X-Forwarded-For (one proxy hop). Without this, req.ip is Vercel's proxy
// address for every request, so express-rate-limit put ALL users into one
// shared bucket (and logged ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
// request) - e.g. userFacingLimiter's 20/min was a global cap, which the
// order page's 15s dispatch tick would exhaust with a handful of customers.
app.set('trust proxy', 1);

// Middleware Keamanan & Utilitas
app.use(helmet()); // Mengamankan header HTTP
// CORS: only Wira's own apps may call this API from a browser. The bare
// cors() we had before let any website script requests against it.
//  - production URLs of the three frontends (plus their wira10 aliases);
//  - Vercel preview/branch deploys of those three projects only
//    (wira-{user,mitra,admin}-<hash|git-branch>-wira10.vercel.app);
//  - the Capacitor apps (Android androidScheme "https" -> https://localhost,
//    iOS -> capacitor://localhost);
//  - local Vite dev servers (user 3000, admin 3001, mitra Vite default 5173);
//  - CORS_EXTRA_ORIGINS (comma-separated) for e.g. a future custom domain.
// Requests with no Origin header (Midtrans/Mutasiku webhooks, pg_cron's
// pg_net call to /api/dispatch/tick, curl) are not browser cross-origin
// requests and are allowed through. A disallowed origin gets callback(null,
// false): no CORS headers, so the browser blocks it - not an Error, which
// would turn every such request into a 500 via the global error handler.
const DEV_PORTS = [3000, 3001, 5173];
const ALLOWED_ORIGINS = new Set([
  'https://wira-pied.vercel.app',
  'https://wira-user-wira10.vercel.app',
  'https://wira-zlw9.vercel.app',
  'https://wira-mitra-wira10.vercel.app',
  'https://wira-bj5r.vercel.app',
  'https://wira-admin-wira10.vercel.app',
  'https://localhost',
  'capacitor://localhost',
  ...DEV_PORTS.flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]),
  ...(process.env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/wira-(user|mitra|admin)-[a-z0-9-]+-wira10\.vercel\.app$/;

app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || ALLOWED_ORIGINS.has(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);
    callback(null, allowed);
  },
}));
app.use(express.json()); // Parsing JSON body
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // Logging request untuk pengembangan

// Root endpoint untuk health check
app.get('/', (req, res) => {
  res.json({ message: 'Wira Super-App API Berjalan Normal', version: '1.0.0' });
});

// Import Routes
// Only endpoints that need a secret (service-role key, Midtrans server key,
// webhook secrets, FCM credentials) live here - everything else is done by
// the frontends directly against Supabase under RLS.
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/midtrans', require('./routes/midtrans'));
app.use('/api/mutasiku', require('./routes/mutasiku'));
app.use('/api/dispatch', require('./routes/dispatch.routes'));

// Handler untuk rute yang tidak ditemukan
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// Handler error global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan internal server' });
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server Wira API berjalan di port ${PORT}`);
  });
}

module.exports = app;

