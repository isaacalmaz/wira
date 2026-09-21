const fs = require('fs');
let code = fs.readFileSync('frontend-mitra/src/App.jsx', 'utf8');
code = code.replace(
  /<Route path="active-order\/:id" element=\{<ActiveOrderPage \/>\} \/>/g,
  "<Route path=\"active-order/:id\" element={<ActiveOrderPage />} />\n              <Route path=\"support\" element={<SupportPage />} />"
);
// Fix the duplication that might have happened on the first one
code = code.replace(
  /<Route path="active-order\/:id" element=\{<ActiveOrderPage \/>\} \/>\n              <Route path="support" element=\{<SupportPage \/>\} \/>\n              <Route path="support" element=\{<SupportPage \/>\} \/>/g,
  "<Route path=\"active-order/:id\" element={<ActiveOrderPage />} />\n              <Route path=\"support\" element={<SupportPage />} />"
);
fs.writeFileSync('frontend-mitra/src/App.jsx', code);
