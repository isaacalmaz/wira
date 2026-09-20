const fs = require('fs');
const file = 'frontend-user/src/pages/ActivityPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Insert the import correctly
if (!content.includes('import { useNavigate } from \'react-router-dom\';')) {
  content = content.replace(
    "import { useState } from 'react';",
    "import { useState } from 'react';\nimport { useNavigate } from 'react-router-dom';"
  );
  fs.writeFileSync(file, content);
  console.log('Fixed import');
} else {
  console.log('Import already exists');
}
