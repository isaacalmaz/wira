const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'frontend-user', 'src', 'pages');
const pages = ['RidePage.jsx', 'FoodPage.jsx', 'PoolPage.jsx', 'RestaurantPage.jsx', 'VillaPage.jsx', 'SendPage.jsx', 'ServicePage.jsx'];

for (const page of pages) {
  const filePath = path.join(pagesDir, page);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add navigate if missing
    // All these pages already use useNavigate, so we just replace the set state
    content = content.replace(/setActiveOrderId\(order\.id\);/g, "navigate(`/active-order/${order.id}`);");
    
    fs.writeFileSync(filePath, content);
    console.log(`Patched ${page}`);
  }
}
