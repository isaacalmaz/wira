const { validationResult } = require('express-validator');
const response = require('../utils/response');

// Middleware untuk memvalidasi input dari express-validator
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return response.error(res, 'Validasi gagal', 400, errors.array());
  }
  next();
};

module.exports = validate;
