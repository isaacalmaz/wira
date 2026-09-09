import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { X, Send, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ChatModal({ orderId, onClose, receiverName }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!orderId || !user) return;

    // Fetch existing messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    const text = input;
    setInput('');
    await supabase.from('messages').insert([{ order_id: orderId, sender_id: user.id, text }]);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Kompresi ekstrim (0.6 quality) agar tidak memberatkan kolom teks DB
        const base64Compressed = canvas.toDataURL('image/jpeg', 0.6);
        const text = `[IMAGE]${base64Compressed}`;
        
        await supabase.from('messages').insert([{ order_id: orderId, sender_id: user.id, text }]);
        setIsUploading(false);
      };
    };
    e.target.value = null; // reset input
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white dark:bg-slate-800 w-full sm:w-[400px] h-[80vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700 bg-primary text-white">
          <h3 className="font-bold">Chat dengan {receiverName || 'Driver'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition"><X size={20} /></button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Belum ada pesan. Sapa driver Anda!
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === user.id;
              const isImage = m.text.startsWith('[IMAGE]');
              const content = isImage ? m.text.replace('[IMAGE]', '') : m.text;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] p-3 rounded-2xl ${isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`}>
                    {isImage ? (
                      <img src={content} alt="Attachment" className="w-full rounded-lg mb-1" />
                    ) : (
                      <p className="text-sm break-words">{content}</p>
                    )}
                    <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-primary-100' : 'text-slate-400'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {isUploading && (
            <div className="flex justify-end">
              <div className="bg-primary/50 text-white text-xs px-3 py-1 rounded-full animate-pulse">Mengirim gambar...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-2 items-center">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
          />
          <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-500 hover:text-primary transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Kirim Gambar">
            <ImageIcon size={20} />
          </button>

          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ketik pesan..." 
            className="flex-1 px-4 py-2.5 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 focus:outline-none focus:border-primary text-sm"
          />
          <button onClick={handleSend} className="p-2.5 bg-primary text-white rounded-full hover:bg-opacity-90 transition-colors">
            <Send size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
