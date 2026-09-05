const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', (req, res) => response.success(res, [], 'Daftar notifikasi'));
router.put('/:id/read', (req, res) => response.success(res, {}, 'Notifikasi ditandai dibaca'));
router.put('/read-all', (req, res) => response.success(res, {}, 'Semua notifikasi ditandai dibaca'));

module.exports = router;
