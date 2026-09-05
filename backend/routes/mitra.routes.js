const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

router.post('/register', (req, res) => response.success(res, {}, 'Pendaftaran mitra berhasil'));

router.use(auth);
// Bisa diakses oleh role driver, merchant, atau technician
router.use(requireRole('driver', 'merchant', 'technician'));

router.get('/profile', (req, res) => response.success(res, {}, 'Profil mitra'));
router.get('/orders', (req, res) => response.success(res, [], 'Pesanan masuk'));
router.put('/orders/:id/accept', (req, res) => response.success(res, {}, 'Pesanan diterima'));
router.put('/orders/:id/complete', (req, res) => response.success(res, {}, 'Pesanan selesai'));
router.get('/earnings', (req, res) => response.success(res, { today: 50000 }, 'Ringkasan pendapatan'));
router.put('/status', (req, res) => response.success(res, {}, 'Status online/offline diperbarui'));

// Manajemen Menu untuk Merchant
router.get('/menu', (req, res) => response.success(res, [], 'Daftar menu'));
router.post('/menu', (req, res) => response.success(res, {}, 'Menu ditambahkan'));
router.put('/menu', (req, res) => response.success(res, {}, 'Menu diperbarui'));
router.delete('/menu', (req, res) => response.success(res, {}, 'Menu dihapus'));

module.exports = router;
