import re

with open('frontend-admin/src/components/layout/AdminSidebar.jsx', 'r') as f:
    content = f.read()

if "MessageSquare" not in content:
    content = content.replace("MessageCircle,", "MessageCircle, MessageSquare,")

new_menu = "    { name: 'Pusat Bantuan', icon: MessageSquare, path: '/support-tickets', roles: ['Superadmin', 'CS'] },\n"
content = content.replace("    { name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: ['Superadmin', 'CS'] },", new_menu + "    { name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: ['Superadmin', 'CS'] },")

with open('frontend-admin/src/components/layout/AdminSidebar.jsx', 'w') as f:
    f.write(content)


with open('frontend-admin/src/App.jsx', 'r') as f:
    app_content = f.read()

if "SupportTicketsPage" not in app_content:
    app_content = app_content.replace("import WhatsAppPage from './pages/WhatsAppPage';", "import WhatsAppPage from './pages/WhatsAppPage';\nimport SupportTicketsPage from './pages/SupportTicketsPage';")

if "/support-tickets" not in app_content:
    app_content = app_content.replace('<Route path="/whatsapp" element={<WhatsAppPage />} />', '<Route path="/whatsapp" element={<WhatsAppPage />} />\n                <Route path="/support-tickets" element={<SupportTicketsPage />} />')

with open('frontend-admin/src/App.jsx', 'w') as f:
    f.write(app_content)

