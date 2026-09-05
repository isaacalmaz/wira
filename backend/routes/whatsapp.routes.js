const express = require('express');
const router = express.Router();
const response = require('../utils/response');
// const whatsappService = require('../services/whatsapp.service');

// Menerima pesan masuk (Webhook dari penyedia WA)
router.post('/webhook', (req, res) => {
  console.log('Webhook WA diterima:', req.body);
  response.success(res, {}, 'Webhook diterima');
});

// Mengirim pesan (Hanya untuk penggunaan internal/admin)
router.post('/send', (req, res) => {
  response.success(res, {}, 'Pesan dikirim (Simulasi)');
});

module.exports = router;
