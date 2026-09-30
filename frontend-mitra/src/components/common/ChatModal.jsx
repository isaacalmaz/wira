import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabase';
import { Send, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { Sheet, Spinner, cx } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

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
    // Match ActiveOrderPage.jsx's inline chat error handling - a failed
    // insert (RLS denial, dropped connection) previously cleared the input
    // and gave zero feedback, silently dropping the message.
    const { error } = await supabase.from('messages').insert([{ order_id: orderId, sender_id: user.id, text }]);
    if (error) {
      console.error(error);
      toast.error('Gagal mengirim pesan');
    }
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

        const { error } = await supabase.from('messages').insert([{ order_id: orderId, sender_id: user.id, text }]);
        if (error) {
          console.error(error);
          toast.error('Gagal mengirim gambar');
        }
        setIsUploading(false);
      };
    };
    e.target.value = null; // reset input
  };

  // Always rendered while the parent keeps it mounted, so `open` is fixed.
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Chat dengan ${receiverName || 'Driver'}`}
      icon={<MessageSquare size={20} />}
      className="h-[85dvh] md:h-[640px]"
      bodyClassName="flex flex-col gap-2.5 border-t border-line mt-3 md:mt-4"
      footer={(
        <div className="flex items-center gap-2 border-t border-line pt-3 sm:flex-1">
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
            title="Kirim Gambar"
            aria-label="Kirim Gambar"
          >
            <ImageIcon size={20} />
          </button>

          <input
            type="text"
            data-autofocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ketik pesan..."
            aria-label="Ketik pesan..."
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="button"
            onClick={handleSend}
            title="Kirim"
            aria-label="Kirim"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover"
          >
            <Send size={17} />
          </button>
        </div>
      )}
    >
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-6 text-center text-[13px] leading-relaxed text-ink-muted">
          Belum ada pesan. Sapa driver Anda!
        </div>
      ) : (
        messages.map((m) => {
          const isMe = m.sender_id === user.id;
          const isImage = m.text.startsWith('[IMAGE]');
          const content = isImage ? m.text.replace('[IMAGE]', '') : m.text;
          return (
            <div key={m.id} className={cx('flex flex-col gap-0.5', isMe ? 'items-end' : 'items-start')}>
              <div
                className={cx(
                  'max-w-[80%] break-words rounded-card text-sm leading-relaxed',
                  isImage ? 'p-1.5' : 'px-3.5 py-2',
                  isMe ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink',
                )}
              >
                {isImage ? (
                  <img src={content} alt="Attachment" className="w-full rounded-[12px] bg-sunken" />
                ) : (
                  <p className="whitespace-pre-wrap">{content}</p>
                )}
              </div>
              <span className="px-1 font-mono text-[10.5px] text-ink-muted">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })
      )}
      {isUploading && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
            <Spinner size={12} /> Mengirim gambar...
          </span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </Sheet>
  );
}
