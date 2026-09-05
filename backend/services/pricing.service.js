const pricingConfig = require('../config/pricing');
const calculateDistance = require('../utils/distance');

class PricingService {
  // Menghitung harga WiraRide
  calculateRide(type, lat1, lon1, lat2, lon2) {
    const distanceKm = calculateDistance(lat1, lon1, lat2, lon2);
    const config = pricingConfig.WiraRide[type] || pricingConfig.WiraRide.bike;
    
    // Harga dasar + (Jarak * Harga per KM)
    const totalPrice = config.base + (Math.ceil(distanceKm) * config.perKm);
    
    return {
      distanceKm: distanceKm.toFixed(2),
      price: Math.max(config.base, totalPrice) // Tidak boleh kurang dari base price
    };
  }

  // Menghitung harga WiraSend
  calculateSend(type, lat1, lon1, lat2, lon2) {
    const distanceKm = calculateDistance(lat1, lon1, lat2, lon2);
    const config = pricingConfig.WiraSend[type] || pricingConfig.WiraSend.kecil;
    
    const totalPrice = config.base + (Math.ceil(distanceKm) * config.perKm);
    return { distanceKm: distanceKm.toFixed(2), price: Math.max(config.base, totalPrice) };
  }
}

module.exports = new PricingService();
