import re

with open('frontend-user/src/App.jsx', 'r') as f:
    content = f.read()

# Add import
if "SupportPage" not in content:
    content = content.replace("import RefundPage from './pages/legal/RefundPage';", "import RefundPage from './pages/legal/RefundPage';\nimport SupportPage from './pages/SupportPage';")

# Add route
if "/support" not in content:
    content = content.replace('<Route path="/contact" element={<ContactPage />} />', '<Route path="/support" element={<SupportPage />} />\n                            <Route path="/contact" element={<ContactPage />} />')

with open('frontend-user/src/App.jsx', 'w') as f:
    f.write(content)

