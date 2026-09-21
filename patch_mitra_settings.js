const fs = require('fs');
let code = fs.readFileSync('frontend-mitra/src/pages/shared/SettingsPage.jsx', 'utf8');

// import MessageSquare and Link
if (!code.includes('MessageSquare')) {
    code = code.replace(
      "import { User, Phone, Save, Loader2, Image as ImageIcon, Camera, Car, Package, Utensils, Moon } from 'lucide-react';",
      "import { User, Phone, Save, Loader2, Image as ImageIcon, Camera, Car, Package, Utensils, Moon, MessageSquare } from 'lucide-react';"
    );
}

if (!code.includes('import { Link } from')) {
    code = code.replace(
      "import { supabase } from '../../../config/supabase';",
      "import { supabase } from '../../../config/supabase';\nimport { Link } from 'react-router-dom';"
    );
}

// Add Card for Support
const supportCard = `
      <Card className="divide-y divide-slate-100 dark:divide-slate-700">
        <Link to="../support" className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition block">
          <div className="flex items-center gap-4">
            <MessageSquare className="text-slate-500" />
            <span className="font-medium dark:text-white">Pusat Bantuan & Komplain</span>
          </div>
          <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">Baru</span>
        </Link>
      </Card>
`;

code = code.replace(
  "      <Card className=\"p-4 flex items-center justify-between\">",
  supportCard + "\n      <Card className=\"p-4 flex items-center justify-between\">"
);

fs.writeFileSync('frontend-mitra/src/pages/shared/SettingsPage.jsx', code);
