const fs = require('fs');
const path = 'frontend-user/src/pages/HomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldGrid = `{activeServices.filter((s) => s.enabled).map((service) => {
          const IconComponent = service.icon;
          
          return (
            <Link
              key={service.id}
              to={service.path}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                style={{ backgroundColor: service.color }}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-200"
              >
                {IconComponent ? (
                  <IconComponent size={24} className="text-white" />
                ) : (
                  <span className="text-xl font-bold">
                    {service.name_id.charAt(4)}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-center text-slate-700 dark:text-slate-300 leading-tight">
                {service.name_id}
              </span>
            </Link>
          );
        })}`;

const newGrid = `{activeServices.map((service) => {
          const IconComponent = service.icon;
          const isEnabled = service.enabled;
          const Wrapper = isEnabled ? Link : 'div';
          
          return (
            <Wrapper
              key={service.id}
              to={isEnabled ? service.path : undefined}
              className={\`flex flex-col items-center gap-1.5 group \${isEnabled ? '' : 'opacity-50 grayscale cursor-not-allowed'}\`}
              onClick={(e) => {
                if (!isEnabled) {
                  e.preventDefault();
                }
              }}
            >
              <div
                style={{ backgroundColor: isEnabled ? service.color : '#94a3b8' }}
                className={\`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md \${isEnabled ? 'group-hover:scale-110 group-hover:shadow-lg transition-all duration-200' : ''}\`}
              >
                {IconComponent ? (
                  <IconComponent size={24} className="text-white" />
                ) : (
                  <span className="text-xl font-bold">
                    {service.name_id.charAt(4)}
                  </span>
                )}
              </div>
              <span className={\`text-xs font-medium text-center leading-tight \${isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}\`}>
                {service.name_id}
              </span>
            </Wrapper>
          );
        })}`;

if (content.includes('activeServices.filter((s) => s.enabled).map')) {
    content = content.replace(oldGrid, newGrid);
    fs.writeFileSync(path, content);
    console.log('Patch success!');
} else {
    console.log('Could not find the target string. The file might have been formatted differently.');
}
