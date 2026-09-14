const supabase = require('../config/supabase');

class MatchingService {
  /**
   * Find the nearest online drivers to a pickup point using the PostGIS
   * get_nearest_drivers RPC (unbounded radius, sorted by real distance).
   * @param {{ lat: number, lng: number }} location - pickup coordinates
   * @param {string|null} vehicleType - 'motor' | 'mobil' | null for any
   * @returns {Promise<object|null>} nearest driver, or null if none online nearby
   */
  async findDriver(orderId, location, vehicleType = null) {
    if (!location || location.lat == null || location.lng == null) {
      throw new Error('findDriver requires a valid { lat, lng } pickup location');
    }

    const { data, error } = await supabase.rpc('get_nearest_drivers', {
      user_lat: location.lat,
      user_lng: location.lng,
      target_vehicle_type: vehicleType,
      only_online: true,
      max_results: 1
    });

    if (error) throw new Error(`findDriver RPC failed: ${error.message}`);
    return (data && data[0]) || null;
  }

  /**
   * Find the nearest online technicians to a job location. Technicians are
   * stored in the same public.drivers table (mitra_access includes
   * 'technician'), so the same proximity RPC applies.
   */
  async findTechnician(orderId, location) {
    if (!location || location.lat == null || location.lng == null) {
      throw new Error('findTechnician requires a valid { lat, lng } job location');
    }

    const { data, error } = await supabase.rpc('get_nearest_drivers', {
      user_lat: location.lat,
      user_lng: location.lng,
      target_vehicle_type: null,
      only_online: true,
      max_results: 1
    });

    if (error) throw new Error(`findTechnician RPC failed: ${error.message}`);
    return (data && data[0]) || null;
  }
}

module.exports = new MatchingService();
