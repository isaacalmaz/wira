const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');

// Rute Pengguna
router.get('/profile', auth, (req, res) => response.success(res, {}, 'Profil pengguna'));
router.put('/profile', auth, (req, res) => response.success(res, {}, 'Profil diperbarui'));
router.get('/addresses', auth, (req, res) => response.success(res, [], 'Daftar alamat'));
router.post('/addresses', auth, (req, res) => response.success(res, {}, 'Alamat ditambahkan'));
router.put('/addresses/:id', auth, (req, res) => response.success(res, {}, 'Alamat diperbarui'));
router.delete('/addresses/:id', auth, (req, res) => response.success(res, {}, 'Alamat dihapus'));
router.put('/settings', auth, (req, res) => response.success(res, {}, 'Pengaturan disimpan'));

module.exports = router;
