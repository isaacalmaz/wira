const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(auth);
router.use(requireFeature('WiraPool'));

router.get('/services', (req, res) => response.success(res, [], 'Layanan kolam renang'));
router.post('/book', (req, res) => response.success(res, {}, 'Pemesanan layanan kolam'));
router.post('/subscribe', (req, res) => response.success(res, {}, 'Langganan bulanan berhasil'));
router.get('/history', (req, res) => response.success(res, [], 'Riwayat kolam renang'));
router.get('/:id', (req, res) => response.success(res, {}, 'Detail pesanan kolam'));

module.exports = router;
