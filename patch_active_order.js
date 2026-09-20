const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Fix the select query
content = content.replace(
  ".select('*, driver:driver_id(name, phone, vehicle_type, plate_number), merchant:merchant_id(name, address)')",
  ".select('*, driver:driver_id(name, phone, vehicle_type), merchant:merchant_id(name, address)')"
);

// We need to fetch vehicle_plate from drivers table
content = content.replace(
  "const { data: dData } = await supabase.from('drivers').select('lat, lng').eq('id', data.driver_id).single();",
  "const { data: dData } = await supabase.from('drivers').select('lat, lng, vehicle_plate').eq('id', data.driver_id).single();\n        if (dData?.vehicle_plate) data.driver.plate_number = dData.vehicle_plate;"
);

fs.writeFileSync(file, content);
console.log('Patched');
