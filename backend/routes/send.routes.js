const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(auth);
router.use(requireFeature('WiraSend'));

router.post('/estimate', (req, res) => response.success(res, { price: 20000 }, 'Estimasi kurir'));
router.post('/book', (req, res) => response.success(res, { orderId: 'WS-123' }, 'Pesanan kurir dibuat'));
router.get('/history', (req, res) => response.success(res, [], 'Riwayat kurir'));
router.get('/:id', (req, res) => response.success(res, {}, 'Detail pengiriman'));

module.exports = router;
