const fs = require('fs');
const path = 'frontend-user/src/pages/HomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "{activeServices.filter((s) => s.enabled).map((service) => {",
  "{activeServices.map((service) => {"
);

content = content.replace(
  "to={service.path}",
  "to={service.enabled ? service.path : '#'}"
);

content = content.replace(
  'className="flex flex-col items-center gap-1.5 group"',
  'className={`flex flex-col items-center gap-1.5 group ${service.enabled ? "" : "opacity-40 grayscale cursor-not-allowed"}`} onClick={(e) => { if(!service.enabled) e.preventDefault(); }}'
);

content = content.replace(
  'style={{ backgroundColor: service.color }}',
  'style={{ backgroundColor: service.enabled ? service.color : "#94a3b8" }}'
);

fs.writeFileSync(path, content);
console.log('Patched');
