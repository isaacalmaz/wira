import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { X, Send, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Spinner } from '../ui';

export default function ChatModal({ orderId, onClose, receiverName }) {
  const { user } = useAuth();
  const { t } = useTranslation();
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

  const partnerName = receiverName || t('chat.default_partner');

  // A full-height panel rather than a <Sheet>: a conversation needs the
  // whole height and a pinned composer. Styled to the Tenun Laut system.
  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-label={t('chat.title_with_name', { name: partnerName })}>
      <div className="absolute inset-0 bg-laut-900/55" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-ground shadow-sheet md:h-[640px] md:max-w-md md:rounded-sheet">

        {/* Header */}
        <div className="flex shrink-0 flex-col border-b border-line bg-ground">
          <div className="flex justify-center pt-2.5 pb-1 md:hidden">
            <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-3 px-4 pb-3 pt-1 md:pt-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-[15px] font-bold text-brand-ink" aria-hidden="true">
              {partnerName.trim().charAt(0).toUpperCase()}
            </span>
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-ink">
              {t('chat.title_with_name', { name: partnerName })}
            </h3>
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm leading-relaxed text-ink-muted">
              {t('chat.empty')}
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === user.id;
              const isImage = m.text.startsWith('[IMAGE]');
              const content = isImage ? m.text.replace('[IMAGE]', '') : m.text;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-card px-3.5 py-2.5 ${isMe ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink'}`}>
                    {isImage ? (
                      <img src={content} alt="" className="mb-1 w-full rounded-[10px]" />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</p>
                    )}
                    <p className={`mt-1 text-right font-mono text-[10.5px] ${isMe ? 'text-white/70' : 'text-ink-muted'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {isUploading && (
            <div className="flex justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-ink">
                <Spinner size={12} />
                {t('chat.uploading')}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken hover:text-brand-ink"
            title={t('chat.send_image')}
            aria-label={t('chat.send_image')}
          >
            <ImageIcon size={20} />
          </button>

          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('chat.placeholder')} 
            aria-label={t('chat.placeholder')}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ground px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label={t('chat.send')}
            title={t('chat.send')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>

      </div>
    </div>
  );
}
