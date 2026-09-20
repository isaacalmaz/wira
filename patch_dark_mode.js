const fs = require('fs');

function patchUser() {
  const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(
    'className="flex flex-col h-screen bg-gray-50"',
    'className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 -mx-4 md:-mx-0 -mt-4 md:-mt-0"'
  );
  
  content = content.replace(
    'className="bg-white p-4 mb-2 shadow-sm shrink-0"',
    'className="bg-white dark:bg-slate-800 p-4 mb-2 shadow-sm shrink-0 border-b dark:border-slate-700"'
  );
  
  content = content.replace(
    'className="text-gray-600 text-sm"',
    'className="text-gray-600 dark:text-gray-300 text-sm"'
  );

  content = content.replace(
    'className="bg-white p-4 mb-2 shadow-sm shrink-0 flex items-center justify-between"',
    'className="bg-white dark:bg-slate-800 p-4 mb-2 shadow-sm shrink-0 flex items-center justify-between border-b dark:border-slate-700"'
  );
  
  content = content.replace(
    'className="text-sm text-gray-600"',
    'className="text-sm text-gray-600 dark:text-gray-400"'
  );

  content = content.replace(
    'className="p-4 shrink-0 bg-white shadow-sm mb-2"',
    'className="p-4 shrink-0 bg-white dark:bg-slate-800 shadow-sm mb-2"'
  );

  content = content.replace(
    'className="flex-1 bg-white shadow-sm p-4 flex flex-col"',
    'className="flex-1 bg-white dark:bg-slate-800 shadow-sm p-4 flex flex-col"'
  );

  content = content.replace(
    'className="flex-1 overflow-y-auto min-h-[150px] mb-3 space-y-2 p-2 bg-slate-50 rounded-xl"',
    'className="flex-1 overflow-y-auto min-h-[150px] mb-3 space-y-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl"'
  );

  content = content.replace(
    'bg-white border border-gray-100 rounded-bl-none text-gray-800',
    'bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 rounded-bl-none text-gray-800 dark:text-white'
  );

  // Fix the input!
  content = content.replace(
    'className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"',
    'className="flex-1 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"'
  );

  fs.writeFileSync(file, content);
  console.log('Patched User App Dark Mode');
}

function patchMitra() {
  const file = 'frontend-mitra/src/pages/shared/ActiveOrderPage.jsx';
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(
    'className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 -mx-4 md:-mx-8 -mt-4 md:-mt-8"',
    'className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-slate-900 -mx-4 md:-mx-8 -mt-4 md:-mt-8"'
  );
  
  content = content.replace(
    'className="bg-white p-4 shadow-sm rounded-xl"',
    'className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl"'
  );
  
  content = content.replace(
    'className="bg-white p-4 shadow-sm rounded-xl flex items-center justify-between"',
    'className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl flex items-center justify-between"'
  );

  content = content.replace(
    'className="flex-1 bg-white shadow-sm rounded-xl p-4 flex flex-col min-h-[300px]"',
    'className="flex-1 bg-white dark:bg-slate-800 shadow-sm rounded-xl p-4 flex flex-col min-h-[300px]"'
  );

  content = content.replace(
    'className="flex-1 overflow-y-auto mb-3 space-y-2 p-2 bg-slate-50 rounded-xl"',
    'className="flex-1 overflow-y-auto mb-3 space-y-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl"'
  );

  content = content.replace(
    'bg-white border border-gray-100 rounded-bl-none text-gray-800',
    'bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 rounded-bl-none text-gray-800 dark:text-white'
  );

  // Fix the input!
  content = content.replace(
    'className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"',
    'className="flex-1 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"'
  );

  fs.writeFileSync(file, content);
  console.log('Patched Mitra App Dark Mode');
}

patchUser();
patchMitra();
