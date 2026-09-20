const fs = require('fs');
const file = 'frontend-user/src/pages/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const oldChat = /<div className="flex-1 overflow-y-auto min-h-\[150px\] mb-3 space-y-3" ref={chatRef}>[\s\S]*?<\/form>/;
const newChat = `<div className="flex-1 overflow-y-auto min-h-[150px] mb-3 space-y-2 p-2 bg-slate-50 rounded-xl" ref={chatRef}>
            {messages.length === 0 && <div className="text-center text-gray-400 text-xs mt-4">Belum ada pesan</div>}
            {messages.map((m, i) => (
              <div key={i} className={\`flex flex-col \${m.sender_id === user?.id ? 'items-end' : 'items-start'}\`}>
                <div className={\`px-3 py-2 rounded-2xl max-w-[85%] text-sm shadow-sm \${m.sender_id === user?.id ? 'bg-primary text-white rounded-br-none' : 'bg-white border border-gray-100 rounded-bl-none text-gray-800'}\`}>
                  {m.text}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5 px-1">
                  {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 shrink-0">
            <input 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder="Ketik pesan..." 
              className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
            />
            <button type="submit" disabled={!inputText.trim()} className="p-2.5 bg-primary text-white rounded-full disabled:opacity-50 transition-colors"><Send size={16}/></button>
          </form>`;

content = content.replace(oldChat, newChat);
fs.writeFileSync(file, content);
console.log('Patched User Chat');
