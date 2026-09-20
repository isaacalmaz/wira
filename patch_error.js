const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "toast.error('Pesanan tidak ditemukan');",
  "toast.error('Gagal memuat pesanan: ' + (err.message || err.toString()));"
);

fs.writeFileSync(file, content);
console.log('Patched error message');
