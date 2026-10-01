import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useTranslation } from '../../i18n';
import { cx } from '../../components/ui';

/**
 * One customer-technician thread on a project (migrations/0093). Contact
 * details are masked by the database until the project goes to that
 * technician.
 */
export default function ProjectChat({ projectId, technicianId, userId }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('project_messages')
      .select('id, sender_id, body, created_at')
      .eq('project_id', projectId)
      .eq('technician_id', technicianId)
      .order('created_at');
    setMessages(data || []);
    setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
  }, [projectId, technicianId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`project-chat-${projectId}-${technicianId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, technicianId, load]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from('project_messages').insert({ project_id: projectId, technician_id: technicianId, sender_id: userId, body });
    setSending(false);
    if (error) { toast.error(t('projects.chat_failed')); return; }
    setText('');
    load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div ref={listRef} className="flex max-h-80 min-h-[160px] flex-col gap-2 overflow-y-auto rounded-control border border-line bg-ground p-3">
        {messages.length === 0 && <p className="m-auto text-center text-[13px] text-ink-muted">{t('projects.chat_empty')}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={cx('flex flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
              <span className={cx('max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3.5 py-2 text-sm leading-relaxed', mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-card text-ink')}>
                {m.body}
              </span>
              <span className="px-1 font-mono text-[10.5px] text-ink-muted">
                {new Date(m.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-muted">{t('projects.chat_note')}</p>
      <form onSubmit={send} className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-ground px-4 text-sm text-ink placeholder:text-ink-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label={t('chat.send')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
