const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(auth);
router.use(requireFeature('Wallet'));

router.get('/balance', (req, res) => response.success(res, { balance: 50000 }, 'Saldo dompet'));
router.post('/topup', (req, res) => response.success(res, {}, 'Top-up berhasil'));
router.post('/transfer', (req, res) => response.success(res, {}, 'Transfer berhasil'));
router.post('/pay', (req, res) => response.success(res, {}, 'Pembayaran berhasil'));
router.get('/transactions', (req, res) => response.success(res, [], 'Riwayat transaksi'));
router.post('/qr/generate', (req, res) => response.success(res, { qrCode: 'data:image/png;base64,...' }, 'QR Code dibuat'));

module.exports = router;
