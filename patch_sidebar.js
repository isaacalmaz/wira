const fs = require('fs');
const path = 'frontend-user/src/components/layout/Sidebar.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `<div className="mt-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-3">Layanan</p>
          <nav className="space-y-1">
            {SERVICES.map(service => (
              <Link key={service.id} to={service.path} className={\`flex items-center gap-3 p-2 rounded-lg text-sm \${location.pathname.startsWith(service.path) ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}\`}>
                <span className={\`w-2 h-2 rounded-full \${service.color}\`}></span>
                <span>{service.name_id}</span>
              </Link>
            ))}
          </nav>
        </div>`;

content = content.replace(target, '');
fs.writeFileSync(path, content);
console.log('Sidebar patched');
