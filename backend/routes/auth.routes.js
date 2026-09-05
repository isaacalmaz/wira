const express = require('express');
const router = express.Router();
const response = require('../utils/response');
// const authController = require('../controllers/auth.controller');

// Rute Otentikasi (Contoh rute sementara)
router.post('/register', (req, res) => response.success(res, {}, 'Registrasi berhasil (Simulasi)'));
router.post('/login', (req, res) => response.success(res, { token: 'mock-jwt-token' }, 'Login berhasil (Simulasi)'));
router.post('/send-otp', (req, res) => response.success(res, {}, 'OTP terkirim (Simulasi)'));
router.post('/verify-otp', (req, res) => response.success(res, {}, 'OTP diverifikasi (Simulasi)'));
router.get('/me', (req, res) => response.success(res, { name: 'User' }, 'Profil (Simulasi)'));

module.exports = router;
