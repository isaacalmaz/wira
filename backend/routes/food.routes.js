const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(requireFeature('WiraFood'));

router.get('/restaurants', (req, res) => response.success(res, [], 'Daftar restoran'));
router.get('/restaurants/:id', (req, res) => response.success(res, {}, 'Detail restoran'));

router.use(auth); // Endpoint di bawah butuh login
router.post('/orders', (req, res) => response.success(res, { orderId: 'WF-123' }, 'Pesanan dibuat'));
router.get('/orders', (req, res) => response.success(res, [], 'Riwayat pesanan food'));
router.get('/orders/:id', (req, res) => response.success(res, {}, 'Detail pesanan food'));
router.put('/orders/:id/rate', (req, res) => response.success(res, {}, 'Penilaian restoran'));

module.exports = router;
