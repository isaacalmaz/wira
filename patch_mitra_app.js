const fs = require('fs');

let code = fs.readFileSync('frontend-mitra/src/App.jsx', 'utf8');

// Add import
code = code.replace(
  "import ActiveOrderPage from './pages/shared/ActiveOrderPage';",
  "import ActiveOrderPage from './pages/shared/ActiveOrderPage';\nimport SupportPage from './pages/shared/SupportPage';"
);

// Add route to driver
code = code.replace(
  "<Route path=\"active-order/:id\" element={<ActiveOrderPage />} />",
  "<Route path=\"active-order/:id\" element={<ActiveOrderPage />} />\n              <Route path=\"support\" element={<SupportPage />} />"
);

fs.writeFileSync('frontend-mitra/src/App.jsx', code);
