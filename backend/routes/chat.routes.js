const express = require('express');
const router = express.Router();
const response = require('../utils/response');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/:orderId', (req, res) => response.success(res, [], 'Pesan chat'));
router.post('/:orderId', (req, res) => response.success(res, {}, 'Pesan terkirim'));

module.exports = router;
