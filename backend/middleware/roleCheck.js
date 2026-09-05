const response = require('../utils/response');

// Middleware untuk mengecek peran (role) pengguna
// roles: array of allowed roles (contoh: ['superadmin', 'admin_finance'])
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.profile) {
      return response.error(res, 'Akses ditolak: Pengguna tidak terautentikasi', 401);
    }

    const userRole = req.user.profile.role || 'user';

    // Superadmin selalu memiliki akses ke semua endpoint
    if (userRole === 'superadmin') {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      return response.error(res, `Akses ditolak: Membutuhkan role ${allowedRoles.join(' atau ')}`, 403);
    }

    next();
  };
};

module.exports = requireRole;
