import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, RotateCcw, Send, Sparkles, Star, MapPin, ExternalLink } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { sendAssistantMessage } from '../../services/aiAssistantService';
import { Sheet, Money, Badge, IconTile } from '../ui';

export default function AIAssistantSheet({ open, onClose }) {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const { orders = [] } = useOrders() || {};
  const navigate = useNavigate();

  const isEn = lang === 'en';
  const initialGreeting = isEn
    ? 'Hello! I am your Wira AI Concierge. I can help you discover villas in Lombok, find authentic local food on WiraFood, track your orders, or arrange home & equipment services. How can I help you today?'
    : 'Halo! Saya Asisten Wira AI, pemandu lokal Anda di Lombok. Saya dapat membantu mencari villa, memesan kuliner khas Lombok, cek status pesanan, atau pesan jasa perawatan & alat berat. Ada yang bisa dibantu?';

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: initialGreeting,
      widgets: [],
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollToBottom();
        inputRef.current?.focus();
      }, 200);
    }
  }, [open]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (queryText) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const newMessages = [
      ...messages,
      { id: userMsgId, sender: 'user', text: textToSend, widgets: [] },
    ];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await sendAssistantMessage({
        message: textToSend,
        userId: user?.id,
        lang,
        activeOrders: orders,
      });

      if (res && res.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            text: res.reply,
            widgets: res.widgets || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: 'bot',
            text: isEn
              ? 'I received your request! You can explore our services directly from the menu.'
              : 'Permintaan Anda telah kami terima! Anda dapat melihat katalog layanan langsung dari menu.',
            widgets: [],
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: isEn
            ? 'Sorry, I had trouble processing that. Please try again or tap one of the quick suggestions below.'
            : 'Maaf, terjadi kendala saat memproses jawaban. Silakan coba lagi atau pilih pertanyaan cepat di bawah.',
          widgets: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: initialGreeting,
        widgets: [],
      },
    ]);
  };

  const quickChips = [
    { label: isEn ? '🏖️ Private Villa Kuta' : '🏖️ Villa Privat Kuta', query: isEn ? 'Find private villas in Kuta Lombok with pool' : 'Cari villa privat di Kuta Lombok ada kolam renang di bawah 1 juta' },
    { label: isEn ? '🍗 Best Taliwang Food' : '🍗 Ayam Taliwang Terdekat', query: isEn ? 'Recommend best Ayam Taliwang on WiraFood' : 'Rekomendasi Ayam Taliwang terdekat yang enak' },
    { label: isEn ? '🛵 Track My Order' : '🛵 Status Pesanan Saya', query: isEn ? 'What is the status of my active order?' : 'Status pesanan saya yang sedang berjalan' },
    { label: isEn ? '🚜 Mini Excavator Rental' : '🚜 Sewa Excavator Praya', query: isEn ? 'How to rent an excavator in Lombok?' : 'Sewa excavator di Praya untuk proyek' },
    { label: isEn ? '🏊 Pool Maintenance' : '🏊 Perawatan Kolam Renang', query: isEn ? 'Need pool cleaning service' : 'Perawatan kolam renang villa WiraPool' },
    { label: isEn ? '🧹 Sampun Bersih' : '🧹 Sampun Bersih', query: isEn ? 'Tell me about Sampun Bersih waste collection' : 'Layanan angkut sampah Sampun Bersih di Kuta' },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title=""
      size="lg"
      dismissible
    >
      <div className="-mx-5 -mt-5 flex flex-col overflow-hidden bg-card text-ink md:-mx-6 md:-mt-6">
        {/* Tenun Laut Strip on top */}
        <div className="h-2 tenun-band shrink-0" aria-hidden="true" />

        {/* Custom Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <IconTile tone="brand" size="md">
              <Sparkles size={18} aria-hidden="true" />
            </IconTile>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-extrabold tracking-tight text-ink">Wira AI Assistant</h3>
                <span className="flex h-2 w-2 rounded-full bg-success ring-4 ring-success/20" aria-hidden="true" />
              </div>
              <p className="text-[11.5px] text-ink-muted">
                {isEn ? 'Lombok Tourism & Super-App Concierge' : 'Panduan Wisata & Layanan Super-App Lombok'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              title={isEn ? 'Reset chat' : 'Mulai ulang percakapan'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-control text-ink-muted transition hover:bg-sunken hover:text-ink"
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-control text-ink-muted transition hover:bg-sunken hover:text-ink"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-line bg-sunken/60 px-4 py-2.5 sm:px-6">
          {quickChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleSend(chip.query)}
              disabled={isLoading}
              className="inline-flex shrink-0 items-center rounded-full border border-line bg-card px-3 py-1 text-[11.5px] font-semibold text-ink shadow-sm transition hover:border-brand hover:text-brand-ink disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat Scrollable Container */}
        <div className="custom-scroll flex h-[50vh] min-h-[340px] max-h-[520px] flex-col gap-3.5 overflow-y-auto p-4 sm:p-6 text-[13px]">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm">
                    <Sparkles size={13} aria-hidden="true" />
                  </div>
                )}

                <div
                  className={`flex flex-col gap-2.5 max-w-[88%] sm:max-w-[80%] ${
                    isUser
                      ? 'rounded-card rounded-tr-sm bg-brand px-3.5 py-2.5 text-white font-medium shadow-sm'
                      : 'rounded-card rounded-tl-sm border border-line bg-sunken p-3 text-ink shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                  {/* Render Rich Action Widgets if attached */}
                  {!isUser && msg.widgets && msg.widgets.length > 0 && (
                    <div className="flex flex-col gap-2.5 pt-1">
                      {msg.widgets.map((widget, widx) => (
                        <div key={`${msg.id}-widget-${widx}`} className="overflow-hidden rounded-card border border-line bg-card p-3 shadow-sm text-ink">
                          {/* Widget Type: Villa */}
                          {widget.type === 'villa' && (
                            <div className="flex flex-col gap-2">
                              {widget.image && (
                                <div className="relative h-28 w-full overflow-hidden rounded-control bg-brand-soft">
                                  <img
                                    src={widget.image}
                                    alt={widget.title}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold text-emas-400 backdrop-blur">
                                    <Star size={11} className="fill-emas-400 text-emas-400" />
                                    <span>{widget.rating || '4.9'}</span>
                                  </span>
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-[14px] font-extrabold text-ink truncate">{widget.title}</h4>
                                  <p className="flex items-center gap-1 text-[11px] text-ink-muted truncate">
                                    <MapPin size={11} className="shrink-0 text-brand-ink" />
                                    <span>{widget.address}</span>
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <Money value={widget.price} className="text-[14px] font-bold text-brand-ink" />
                                  <span className="block text-[10px] text-ink-muted">{isEn ? '/night' : '/malam'}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(widget.ctaPath || '/villa');
                                }}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                              >
                                <span>{widget.ctaText || (isEn ? 'View Villa' : 'Lihat Villa')}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          )}

                          {/* Widget Type: Food */}
                          {widget.type === 'food' && (
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center gap-3">
                                {widget.image ? (
                                  <img
                                    src={widget.image}
                                    alt={widget.title}
                                    className="h-12 w-12 rounded-tile object-cover shrink-0"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-tile bg-pay-soft text-pay-ink font-bold">
                                    🍲
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <Badge tone="success" dot className="mb-0.5 text-[9.5px]">
                                    {isEn ? 'OPEN NOW' : 'BUKA SEKARANG'}
                                  </Badge>
                                  <h4 className="text-[13.5px] font-extrabold text-ink truncate">{widget.title}</h4>
                                  <p className="text-[11px] text-ink-muted truncate">{widget.address || widget.category}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(widget.ctaPath || '/food');
                                }}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-pay px-3 py-2 text-xs font-bold text-white transition hover:brightness-105"
                              >
                                <span>{widget.ctaText || (isEn ? 'Explore Menu' : 'Buka Menu')}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          )}

                          {/* Widget Type: Tracking */}
                          {widget.type === 'tracking' && (
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-success uppercase">
                                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                                  <span>{t(widget.status || 'home.spot_running', { service: widget.serviceType })}</span>
                                </span>
                                <span className="font-mono text-[11px] font-bold text-ink">#{String(widget.orderId).slice(0, 8)}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(widget.ctaPath);
                                }}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                              >
                                <span>{widget.ctaText || (isEn ? 'Live Map Tracking' : 'Lacak Driver Live')}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          )}

                          {/* Widget Type: Service (Excavator / Pool / Bersih) */}
                          {widget.type === 'service' && (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-[13.5px] font-extrabold text-ink">{widget.title}</h4>
                                  <p className="text-[11px] text-ink-muted leading-relaxed">{widget.subtitle}</p>
                                </div>
                                {widget.price && (
                                  <div className="text-right shrink-0">
                                    <Money value={widget.price} className="text-[13.5px] font-bold text-brand-ink" />
                                    {widget.unit && <span className="block text-[10px] text-ink-muted">{widget.unit}</span>}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(widget.ctaPath || '/service');
                                }}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                              >
                                <span>{widget.ctaText || (isEn ? 'Order Service' : 'Pesan Layanan')}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          )}

                          {/* Widget Type: Ride */}
                          {widget.type === 'ride' && (
                            <div className="flex flex-col gap-2">
                              <div>
                                <h4 className="text-[13.5px] font-extrabold text-ink">{widget.title}</h4>
                                <p className="text-[11px] text-ink-muted">{widget.subtitle}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate('/ride');
                                }}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                              >
                                <span>{widget.ctaText || 'Buka WiraRide →'}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm">
                <Sparkles size={13} aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5 rounded-card rounded-tl-sm border border-line bg-sunken px-3.5 py-2.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-line bg-card p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isEn ? 'Ask about villas, food, ride, or services...' : 'Tanya villa, kuliner, ride, atau layanan...'}
              disabled={isLoading}
              className="flex-1 min-h-11 rounded-control border border-line-strong bg-ground px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control bg-brand px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-50"
            >
              <Send size={15} />
              <span className="hidden sm:inline">{isEn ? 'Send' : 'Kirim'}</span>
            </button>
          </form>
        </div>
      </div>
    </Sheet>
  );
}
