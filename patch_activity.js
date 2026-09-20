const fs = require('fs');
const file = 'frontend-user/src/pages/ActivityPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// The line currently has: onClick={() => setSelectedOrder(act)}
// Change it to: onClick={() => act.status.toLowerCase() === 'pending' || act.status.toLowerCase() === 'ready' || act.rawStatus === 'pending' || act.rawStatus === 'ready' ? navigate(`/active-order/${act.id}`) : setSelectedOrder(act)}

// But we need to make sure useNavigate is imported and instantiated
if (!content.includes('useNavigate')) {
  content = content.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect } from 'react';\nimport { useNavigate } from 'react-router-dom';");
}
if (!content.includes('const navigate = useNavigate();')) {
  content = content.replace("export default function ActivityPage() {", "export default function ActivityPage() {\n  const navigate = useNavigate();");
}

content = content.replace(
  "onClick={() => setSelectedOrder(act)}",
  "onClick={() => ['pending', 'ready', 'accepted', 'menunggu'].includes((act.rawStatus || act.status).toLowerCase()) ? navigate(`/active-order/${act.id}`) : setSelectedOrder(act)}"
);

fs.writeFileSync(file, content);
console.log('ActivityPage patched');
