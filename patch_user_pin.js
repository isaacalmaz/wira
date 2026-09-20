const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Insert the PIN block below the showMap block
const mapBlockRegex = /\{\s*showMap\s*&&\s*\([\s\S]*?<\/\s*MapContainer\s*>\s*<\/\s*div\s*>\s*\)\s*\}/;

const pinBlock = `
        {['accepted', 'picking_up'].includes(order.status) && (
          <div className="bg-white dark:bg-slate-800 p-4 shrink-0 shadow-sm mb-2 border-b dark:border-slate-700 text-center">
            {order.service_type === 'food' ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Driver sedang mengambil pesanan di Restoran (PIN diverifikasi oleh Restoran)</p>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Berikan PIN ini kepada Driver saat bertemu:</p>
                <div className="text-3xl font-bold tracking-[0.3em] text-primary">{order.security_pin || '----'}</div>
              </>
            )}
          </div>
        )}
`;

content = content.replace(mapBlockRegex, (match) => {
  return match + '\n' + pinBlock;
});

fs.writeFileSync(file, content);
console.log('Patched User PIN display');
