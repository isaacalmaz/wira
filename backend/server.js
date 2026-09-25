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
app.use(cors()); // Mengizinkan akses dari frontend/aplikasi lain
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

