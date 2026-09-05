const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(requireFeature('WiraService'));

router.get('/categories', (req, res) => response.success(res, [], 'Kategori layanan'));
router.get('/technicians', (req, res) => response.success(res, [], 'Daftar teknisi'));

router.use(auth);
router.post('/book', (req, res) => response.success(res, {}, 'Layanan dipesan'));
router.get('/history', (req, res) => response.success(res, [], 'Riwayat layanan'));
router.get('/:id', (req, res) => response.success(res, {}, 'Detail layanan'));
router.put('/:id/rate', (req, res) => response.success(res, {}, 'Penilaian teknisi'));

module.exports = router;
