const fs = require('fs');
const files = [
  'frontend-user/src/pages/RidePage.jsx',
  'frontend-user/src/pages/SendPage.jsx',
  'frontend-user/src/pages/PoolPage.jsx',
  'frontend-user/src/pages/ServicePage.jsx'
];

files.forEach(file => {
  let lines = fs.readFileSync(file, 'utf8').split('\n');
  let newLines = [];
  let skip = false;
  let bracketCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Dispatch is handled dynamically')) {
       skip = true;
       bracketCount = 0;
       newLines.push(lines[i]);
       continue;
    }
    if (skip) {
       // if we hit if (driverCount === 0) or similar, we stop skipping
       if (lines[i].includes('if (driverCount === 0)') || lines[i].includes('if (techCount === 0)')) {
          skip = false;
       } else {
          continue;
       }
    }
    newLines.push(lines[i]);
  }
  fs.writeFileSync(file, newLines.join('\n'));
});

// For Mitra ActiveOrderPage.jsx syntax error:
// 249|          {order.customer && (
// 250|            
// 251|          {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (
let mitra = fs.readFileSync('frontend-mitra/src/pages/shared/ActiveOrderPage.jsx', 'utf8');
mitra = mitra.replace(`        {order.customer && (
          {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (`, 
`        {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (
          <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl mb-2 text-center border-b dark:border-slate-700">
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Berikan PIN ini kepada Driver saat penyerahan makanan:</p>
             <div className="text-3xl font-bold tracking-[0.3em] text-primary">{order.security_pin || '----'}</div>
          </div>
        )}
        {order.customer && (`);
fs.writeFileSync('frontend-mitra/src/pages/shared/ActiveOrderPage.jsx', mitra);
console.log('Fixed');
