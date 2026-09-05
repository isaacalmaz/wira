const response = require('../utils/response');
const supabase = require('../config/supabase');
const defaultFeatures = require('../config/features');

// Middleware untuk mengecek apakah fitur aktif di wilayah pengguna
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      const region = req.user?.profile?.region || 'mataram'; // Default ke mataram

      // Ambil feature flags dari database
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('region', region)
        .single();

      let isEnabled = defaultFeatures[featureKey]; // Fallback ke config lokal

      if (!error && data) {
        // Jika ada di database, gunakan nilai database
        if (data.features && data.features[featureKey] !== undefined) {
          isEnabled = data.features[featureKey];
        }
      }

      if (!isEnabled) {
        return response.error(res, `Layanan ${featureKey} belum tersedia di wilayah Anda (${region})`, 403);
      }

      next();
    } catch (error) {
      console.error('Feature check error:', error);
      next(); // Lanjutkan jika terjadi error pada pengecekan agar tidak memblokir aplikasi sepenuhnya
    }
  };
};

module.exports = requireFeature;
