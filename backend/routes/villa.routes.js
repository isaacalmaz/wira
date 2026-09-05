const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireFeature = require('../middleware/featureCheck');

router.use(requireFeature('WiraVilla'));

router.get('/', (req, res) => response.success(res, [], 'Daftar villa'));
router.get('/:id', (req, res) => response.success(res, {}, 'Detail villa'));
router.get('/:id/availability', (req, res) => response.success(res, [], 'Ketersediaan villa'));

router.use(auth);
router.post('/book', (req, res) => response.success(res, {}, 'Booking villa berhasil'));
router.get('/bookings', (req, res) => response.success(res, [], 'Daftar booking villa'));
router.put('/bookings/:id/cancel', (req, res) => response.success(res, {}, 'Booking dibatalkan'));
router.put('/bookings/:id/rate', (req, res) => response.success(res, {}, 'Penilaian villa'));

module.exports = router;
