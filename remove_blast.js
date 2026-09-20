const fs = require('fs');

function removeBlast(file) {
  let content = fs.readFileSync(file, 'utf8');
  const blastRegex = /\/\/ Notify nearby eligible drivers[\s\S]*?\}\);[\s\S]*?\}/;
  content = content.replace(blastRegex, '// Notification dispatch handled dynamically in ActiveOrderPage (Sequential Ping)');
  fs.writeFileSync(file, content);
  console.log('Removed blast from', file);
}

const files = [
  'frontend-user/src/pages/RidePage.jsx',
  'frontend-user/src/pages/SendPage.jsx',
  'frontend-user/src/pages/PoolPage.jsx',
  'frontend-user/src/pages/ServicePage.jsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('nearbyDrivers.forEach') || content.includes('technicians.forEach')) {
      let cleaned = content.replace(/\/\/ Notify nearby[\s\S]*?(?=\n\s*if \()/s, '// Dispatch is handled in ActiveOrderPage\n      ');
      cleaned = cleaned.replace(/if \((nearbyDrivers|technicians)\.length > 0\) \{[\s\S]*?(?=\n\s*if \()/s, '// Dispatch is handled in ActiveOrderPage\n      ');
      
      // Let's do a more robust string replacement manually if regex is scary
      const lines = cleaned.split('\n');
      let inBlast = false;
      let newLines = [];
      for (let i=0; i<lines.length; i++) {
        if (lines[i].includes('supabase.auth.getSession().then(')) {
          // Look backwards to find the if (nearbyDrivers.length > 0)
          let prev = newLines.pop();
          if (prev && prev.includes('if (nearbyDrivers.length > 0)')) prev = newLines.pop();
          if (prev && prev.includes('if (technicians.length > 0)')) prev = newLines.pop();
          inBlast = true;
          continue;
        }
        if (inBlast && lines[i].trim() === '});' && lines[i+1]?.trim() === '}') {
          inBlast = false;
          i++; // skip the closing brace
          continue;
        }
        if (!inBlast) {
          newLines.push(lines[i]);
        }
      }
      fs.writeFileSync(file, newLines.join('\n'));
      console.log('Processed', file);
    }
  }
});
