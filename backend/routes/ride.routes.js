const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(auth);
router.use(requireFeature('WiraRide'));

router.post('/estimate', (req, res) => response.success(res, { price: 15000 }, 'Estimasi harga'));
router.post('/book', (req, res) => response.success(res, { orderId: 'WR-123' }, 'Pesanan dibuat'));
router.get('/:id', (req, res) => response.success(res, {}, 'Detail pesanan'));
router.put('/:id/cancel', (req, res) => response.success(res, {}, 'Pesanan dibatalkan'));
router.put('/:id/rate', (req, res) => response.success(res, {}, 'Penilaian dikirim'));
router.get('/history', (req, res) => response.success(res, [], 'Riwayat pesanan'));

module.exports = router;
