import fs from 'fs';
import path from 'path';

const userFiles = [
  'drivers.js', 'locations.js', 'promos.js', 'restaurants.js', 'technicians.js', 'villas.js'
].map(f => path.join('frontend-user/src/data', f));

const mitraFiles = [
  'menuItems.js', 'orders.js', 'earnings.js', 'schedule.js'
].map(f => path.join('frontend-mitra/src/data', f));

for (const file of [...userFiles, ...mitraFiles]) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    console.log(`\n\n--- ${file} ---`);
    console.log(data);
  } catch (e) {
    console.error(e.message);
  }
}
