const fs = require('fs');

let code = fs.readFileSync('frontend-user/src/pages/DownloadPage.jsx', 'utf8');
code = code.replace(/<Card className="flex flex-col gap-3">[\s\S]*?<\/Card>/g, '');
fs.writeFileSync('frontend-user/src/pages/DownloadPage.jsx', code);
