const fs = require('fs');

function cleanFile(file, arrName) {
  let content = fs.readFileSync(file, 'utf8');
  const target = `if (${arrName}.length > 0) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          ${arrName}.forEach((d) => {
            fetch(\`\${API_BASE_URL}/notifications/order-alert\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: \`Bearer \${session.access_token}\`,
              },
              body: JSON.stringify({
                userId: d.id,
                title:`;
                
   // Just use a regex to match the whole block
   const blockRegex = new RegExp(`if \\(${arrName}\\.length > 0\\) \\{[\\s\\S]*?\\}\\);[\\s\\S]*?\\}`);
   content = content.replace(blockRegex, '// Dispatch is handled dynamically in ActiveOrderPage via Sequential Ping.');
   
   fs.writeFileSync(file, content);
   console.log('Cleaned', file);
}

cleanFile('frontend-user/src/pages/RidePage.jsx', 'nearbyDrivers');
cleanFile('frontend-user/src/pages/SendPage.jsx', 'nearbyDrivers');
cleanFile('frontend-user/src/pages/PoolPage.jsx', 'technicians');
cleanFile('frontend-user/src/pages/ServicePage.jsx', 'technicians');
