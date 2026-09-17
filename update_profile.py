import re

with open('frontend-user/src/pages/ProfilePage.jsx', 'r') as f:
    content = f.read()

# Add a MessageSquare icon import if it's not there
if "MessageSquare" not in content:
    content = content.replace("User, Settings", "User, Settings, MessageSquare")

# Add the new menu item above Pusat Bantuan & Kontak
new_menu = """          <Link to="/support" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
            <div className="flex items-center gap-4">
              <MessageSquare className="text-slate-500" />
              <span className="font-medium dark:text-white">Bantuan & Komplain</span>
            </div>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">Baru</span>
          </Link>
"""
content = content.replace('        {/* Pusat Bantuan & Legal */}\n        <Card className="divide-y divide-slate-100 dark:divide-slate-700">\n', '        {/* Pusat Bantuan & Legal */}\n        <Card className="divide-y divide-slate-100 dark:divide-slate-700">\n' + new_menu)

with open('frontend-user/src/pages/ProfilePage.jsx', 'w') as f:
    f.write(content)

