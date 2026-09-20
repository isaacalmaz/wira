const fs = require('fs');
const files = [
  'frontend-user/src/pages/RidePage.jsx',
  'frontend-user/src/pages/SendPage.jsx',
  'frontend-user/src/pages/VillaPage.jsx',
  'frontend-user/src/pages/PoolPage.jsx',
  'frontend-user/src/pages/ServicePage.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('useNavigate')) {
    // Add import
    content = content.replace(
      "import { useState, useEffect } from 'react';", 
      "import { useState, useEffect } from 'react';\nimport { useNavigate } from 'react-router-dom';"
    );
    // Might not be EXACTLY that string in all files, let's use a safer regex:
    // replace first import with itself + useNavigate
    if (!content.includes('import { useNavigate }')) {
        content = content.replace(/import .*? from 'react';/s, match => match + "\nimport { useNavigate } from 'react-router-dom';");
    }

    // Add hook inside component
    const functionRegex = /export default function \w+\(\)\s*\{/;
    content = content.replace(functionRegex, match => match + "\n  const navigate = useNavigate();");

    fs.writeFileSync(file, content);
    console.log(`Patched ${file}`);
  }
}
