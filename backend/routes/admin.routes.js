const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

router.use(auth);
// Memerlukan role superadmin atau admin untuk semua rute admin
router.use(requireRole('superadmin', 'admin'));

router.get('/dashboard', (req, res) => response.success(res, {}, 'Data dashboard admin'));
router.get('/features', (req, res) => response.success(res, {}, 'Daftar fitur aktif'));
router.put('/features', (req, res) => response.success(res, {}, 'Fitur diperbarui'));
router.get('/users', (req, res) => response.success(res, [], 'Daftar pengguna'));
router.get('/orders', (req, res) => response.success(res, [], 'Daftar semua pesanan'));
router.get('/drivers', (req, res) => response.success(res, [], 'Daftar driver'));
router.put('/drivers', (req, res) => response.success(res, {}, 'Driver diverifikasi'));
router.get('/merchants', (req, res) => response.success(res, [], 'Daftar merchant'));
router.put('/merchants', (req, res) => response.success(res, {}, 'Merchant diverifikasi'));
router.get('/technicians', (req, res) => response.success(res, [], 'Daftar teknisi'));
router.put('/technicians', (req, res) => response.success(res, {}, 'Teknisi diverifikasi'));
router.get('/transactions', (req, res) => response.success(res, [], 'Daftar transaksi'));
router.post('/promos', (req, res) => response.success(res, {}, 'Promo ditambahkan'));
router.put('/promos', (req, res) => response.success(res, {}, 'Promo diperbarui'));
router.delete('/promos', (req, res) => response.success(res, {}, 'Promo dihapus'));
router.put('/settings', (req, res) => response.success(res, {}, 'Pengaturan admin disimpan'));

module.exports = router;
