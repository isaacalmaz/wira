require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

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
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/rides', require('./routes/ride.routes'));
app.use('/api/food', require('./routes/food.routes'));
app.use('/api/send', require('./routes/send.routes'));
app.use('/api/wallet', require('./routes/wallet.routes'));
app.use('/api/villas', require('./routes/villa.routes'));
app.use('/api/services', require('./routes/service.routes'));
app.use('/api/pool', require('./routes/pool.routes'));
app.use('/api/pulsa', require('./routes/pulsa.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/mitra', require('./routes/mitra.routes'));
app.use('/api/whatsapp', require('./routes/whatsapp.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/chat', require('./routes/chat.routes'));

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
app.listen(PORT, () => {
  console.log(`Server Wira API berjalan di port ${PORT}`);
});
