const fs = require('fs');
let code = fs.readFileSync('frontend-user/src/pages/HomePage.jsx', 'utf8');

// Inject import
if (!code.includes('import PromoCarousel')) {
  code = code.replace(
    "import { Plus, ArrowUpRight, Settings2, ChevronUp, ChevronDown } from 'lucide-react';",
    "import { Plus, ArrowUpRight, Settings2, ChevronUp, ChevronDown } from 'lucide-react';\nimport PromoCarousel from '../components/home/PromoCarousel';"
  );
}

// Inject component
if (!code.includes('<PromoCarousel />')) {
  code = code.replace(
    "{/* Aktivitas Terkini (Real-time dari Pesanan User) */}",
    "<PromoCarousel />\n\n      {/* Aktivitas Terkini (Real-time dari Pesanan User) */}"
  );
}

fs.writeFileSync('frontend-user/src/pages/HomePage.jsx', code);
