const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(auth);
router.use(requireFeature('WiraPulsa'));

router.get('/providers', (req, res) => response.success(res, [], 'Daftar provider'));
router.get('/products', (req, res) => response.success(res, [], 'Daftar produk pulsa'));
router.post('/purchase', (req, res) => response.success(res, {}, 'Pembelian berhasil'));
router.get('/history', (req, res) => response.success(res, [], 'Riwayat pembelian pulsa'));

module.exports = router;
