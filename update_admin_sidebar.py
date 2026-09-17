import re

with open('frontend-admin/src/components/layout/Sidebar.jsx', 'r') as f:
    content = f.read()

# Add a MessageSquare icon import if it's not there
if "MessageSquare" not in content:
    content = content.replace("ShieldAlert", "ShieldAlert, MessageSquare")

# Add the new menu item to menuItems array
new_menu = """  { icon: MessageSquare, label: 'Pusat Bantuan', path: '/support-tickets' },
"""
# insert before the generic Settings menu or at the end
content = content.replace("  { icon: ShieldAlert, label: 'Feature Flags', path: '/features' },", new_menu + "  { icon: ShieldAlert, label: 'Feature Flags', path: '/features' },")

with open('frontend-admin/src/components/layout/Sidebar.jsx', 'w') as f:
    f.write(content)

