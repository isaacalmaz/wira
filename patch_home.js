const fs = require('fs');
let code = fs.readFileSync('frontend-user/src/pages/HomePage.jsx', 'utf8');

// 1. Import ChevronUp and ChevronDown
code = code.replace(
  "import { Wallet, Clock, Package, ShoppingBag, ArrowRight, Settings2, X } from 'lucide-react';",
  "import { Wallet, Clock, Package, ShoppingBag, ArrowRight, Settings2, X, ChevronUp, ChevronDown } from 'lucide-react';"
);

// 2. Add serviceOrder state
const stateInjection = `  const [hiddenServices, setHiddenServices] = useState(() => {`;
const newState = `  const [serviceOrder, setServiceOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('serviceOrder');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return SERVICES.map(s => s.id);
  });
  const [hiddenServices, setHiddenServices] = useState(() => {`;
code = code.replace(stateInjection, newState);

// 3. Sort activeServices for rendering
const mapMainGrid = `{activeServices.filter(s => !hiddenServices.includes(s.id)).map((service) => {`;
const newMapMainGrid = `{activeServices
        .slice()
        .sort((a, b) => {
          const indexA = serviceOrder.indexOf(a.id) !== -1 ? serviceOrder.indexOf(a.id) : 999;
          const indexB = serviceOrder.indexOf(b.id) !== -1 ? serviceOrder.indexOf(b.id) : 999;
          return indexA - indexB;
        })
        .filter(s => !hiddenServices.includes(s.id))
        .map((service) => {`;
code = code.replace(mapMainGrid, newMapMainGrid);

// 4. Sort activeServices for modal and add up/down buttons
const mapModalGrid = `{activeServices.map(service => {`;
const newMapModalGrid = `{activeServices
              .slice()
              .sort((a, b) => {
                const indexA = serviceOrder.indexOf(a.id) !== -1 ? serviceOrder.indexOf(a.id) : 999;
                const indexB = serviceOrder.indexOf(b.id) !== -1 ? serviceOrder.indexOf(b.id) : 999;
                return indexA - indexB;
              })
              .map((service, index, array) => {`;
code = code.replace(mapModalGrid, newMapModalGrid);

const modalItemReplace = `const isHidden = hiddenServices.includes(service.id);
                return (
                  <div key={service.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-3">`;

const newModalItem = `const isHidden = hiddenServices.includes(service.id);
                
                const moveUp = () => {
                  if (index === 0) return;
                  const newOrder = [...serviceOrder];
                  // Ensure all items are in serviceOrder
                  const currentIds = array.map(s => s.id);
                  const completeOrder = newOrder.length === currentIds.length ? newOrder : currentIds;
                  
                  const temp = completeOrder[index - 1];
                  completeOrder[index - 1] = completeOrder[index];
                  completeOrder[index] = temp;
                  
                  setServiceOrder(completeOrder);
                  localStorage.setItem('serviceOrder', JSON.stringify(completeOrder));
                };

                const moveDown = () => {
                  if (index === array.length - 1) return;
                  const newOrder = [...serviceOrder];
                  const currentIds = array.map(s => s.id);
                  const completeOrder = newOrder.length === currentIds.length ? newOrder : currentIds;
                  
                  const temp = completeOrder[index + 1];
                  completeOrder[index + 1] = completeOrder[index];
                  completeOrder[index] = temp;
                  
                  setServiceOrder(completeOrder);
                  localStorage.setItem('serviceOrder', JSON.stringify(completeOrder));
                };

                return (
                  <div key={service.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1 mr-1">
                        <button onClick={moveUp} disabled={index === 0} className={\`p-0.5 rounded transition-colors \${index === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'}\`}>
                          <ChevronUp size={16} />
                        </button>
                        <button onClick={moveDown} disabled={index === array.length - 1} className={\`p-0.5 rounded transition-colors \${index === array.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'}\`}>
                          <ChevronDown size={16} />
                        </button>
                      </div>
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: service.color }}>`;

code = code.replace(modalItemReplace, newModalItem);

// Fix the closing div gap-3 to gap-2
code = code.replace(
  `<div className="flex items-center gap-3">\n                      <div className="w-12 h-12`,
  `<div className="flex items-center gap-2">\n                      <div className="w-12 h-12`
);

fs.writeFileSync('frontend-user/src/pages/HomePage.jsx', code);
console.log("Patched HomePage.jsx");
