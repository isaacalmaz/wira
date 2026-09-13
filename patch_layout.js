const fs = require('fs');
const file = 'frontend-user/src/components/layout/Layout.jsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("import { Outlet, Navigate } from 'react-router-dom';", "import { Outlet, Navigate, useLocation } from 'react-router-dom';");

code = code.replace("export default function Layout() {", "export default function Layout() {\n  const location = useLocation();\n  const isFullScreenPage = ['/ride'].includes(location.pathname);");

code = code.replace(
  /<main className="flex-1 overflow-y-auto pb-16 md:pb-0 p-4">\s*<div className="max-w-4xl mx-auto">\s*<Outlet \/>\s*<\/div>\s*<\/main>/,
  `<main className={\`flex-1 overflow-y-auto pb-16 md:pb-0 \${isFullScreenPage ? '' : 'p-4'}\`}>
          <div className={isFullScreenPage ? 'h-full w-full' : 'max-w-4xl mx-auto'}>
            <Outlet />
          </div>
        </main>`
);

fs.writeFileSync(file, code);
