import React, { useState } from 'react';
import { Send } from 'lucide-react';

const ChatInterface = ({ messages: initialMessages, quickReplies, onSend }) => {
  const [msgs, setMsgs] = useState(initialMessages);
  const [input, setInput] = useState('');

  const handleSend = (text) => {
    if (!text.trim()) return;
    const newMsg = { id: Date.now(), sender: 'me', text, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    setMsgs([...msgs, newMsg]);
    setInput('');
    if (onSend) onSend(newMsg);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] p-3 rounded-2xl ${m.sender === 'me' ? 'bg-primary text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-tl-none'}`}>
              <p className="text-sm">{m.text}</p>
              <p className={`text-[10px] mt-1 text-right ${m.sender === 'me' ? 'text-primary-100' : 'text-slate-400'}`}>{m.time}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar mb-2">
          {quickReplies.map((qr, idx) => (
            <button key={idx} onClick={() => handleSend(qr)} className="whitespace-nowrap px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs hover:bg-slate-200 transition-colors">
              {qr}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
            placeholder="Tulis pesan..." 
            className="flex-1 px-4 py-2 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:border-primary"
          />
          <button onClick={() => handleSend(input)} className="p-3 bg-primary text-white rounded-full hover:bg-opacity-90 transition-colors">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ChatInterface;
