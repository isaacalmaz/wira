import { useState } from 'react';
import { Send } from 'lucide-react';

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { id: 1, text: 'Halo, saya sudah di titik penjemputan ya', sender: 'driver', time: '10:00' },
    { id: 2, text: 'Oke pak, sebentar saya jalan ke depan', sender: 'user', time: '10:01' }
  ]);
  const [input, setInput] = useState('');

  const send = () => {
    if(input.trim()) {
      setMessages([...messages, { id: Date.now(), text: input, sender: 'user', time: '10:02' }]);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="bg-white dark:bg-slate-800 p-4 border-b dark:border-slate-700 font-semibold dark:text-white">Chat dengan Pak Yanto</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-2xl ${m.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-slate-200 dark:bg-slate-700 dark:text-white rounded-tl-none'}`}>
              <p className="text-sm">{m.text}</p>
              <p className={`text-[10px] text-right mt-1 ${m.sender==='user'?'text-primary-light':'text-slate-500'}`}>{m.time}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-800 p-4 border-t dark:border-slate-700 flex gap-2">
        <input type="text" className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-full text-sm dark:text-white focus:outline-none" placeholder="Ketik pesan..." value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==='Enter'&&send()} />
        <button onClick={send} className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center"><Send size={18}/></button>
      </div>
    </div>
  );
}
