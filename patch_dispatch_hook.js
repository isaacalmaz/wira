const fs = require('fs');
const file = 'frontend-user/src/hooks/useOrderDispatch.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `             const { data, error } = await supabase.rpc('get_nearest_drivers', {
               p_lat: order.pickup_lat,
               p_lng: order.pickup_lng,
               p_radius_km: 5
             });`,
  `             // Make sure to match the exact arguments used in get_nearest_drivers
             const { data, error } = await supabase.rpc('get_nearest_drivers', {
               user_lat: order.pickup_lat,
               user_lng: order.pickup_lng,
               target_vehicle_type: null,
               only_online: true,
               max_results: 10
             });`
);
fs.writeFileSync(file, content);
console.log('Fixed useOrderDispatch args');
