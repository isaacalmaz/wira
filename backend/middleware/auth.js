const jwt = require('jsonwebtoken');
const response = require('../utils/response');
const supabase = require('../config/supabase');

// Middleware untuk memverifikasi token JWT dari pengguna
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.error(res, 'Token tidak ditemukan atau tidak valid', 401);
    }

    const token = authHeader.split(' ')[1];
    
    // Verifikasi token (Supabase auth token)
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return response.error(res, 'Sesi telah berakhir, silakan login kembali', 401, error);
    }

    // Ambil data profil dari tabel users
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    // Tempelkan data user ke request
    req.user = {
      ...user,
      profile: profile || {}
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return response.error(res, 'Gagal mengautentikasi pengguna', 500);
  }
};

module.exports = authMiddleware;
