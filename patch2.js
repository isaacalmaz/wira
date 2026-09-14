const fs = require('fs');
let code = fs.readFileSync('frontend-user/src/pages/HomePage.jsx', 'utf8');

const badChunk = `                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: service.color }}>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: service.color }}>`;

code = code.replace(badChunk, `                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: service.color }}>`);

fs.writeFileSync('frontend-user/src/pages/HomePage.jsx', code);
