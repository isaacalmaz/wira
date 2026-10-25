import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  RotateCcw,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { sendAssistantMessage, confirmAssistantBooking } from '../../services/aiAssistantService';
import { Sheet, Money, Badge } from '../ui';

function BookingDraftCard({
  draft,
  state = {},
  onSelectPayment,
  onConfirm,
  onCancel,
  onTrack,
  isEn,
}) {
  const currentStatus = state.status || 'draft';
  const paymentMethod = state.paymentMethod || draft.paymentMethod || 'cash';
  const confirmedOrder = state.confirmedOrder;
  const isConfirming = currentStatus === 'confirming';
  const isConfirmed = currentStatus === 'confirmed';
  const isCancelled = currentStatus === 'cancelled';
  const details = draft.details || {};

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5 sm:p-4 text-ink shadow-sm transition">
      {/* Card Header - Clean & Minimal */}
      <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-2.5">
        <div>
          <h4 className="text-[14px] font-extrabold text-ink leading-tight">{draft.serviceName}</h4>
          <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{draft.subtitle || draft.title}</p>
        </div>
        <Badge tone={isConfirmed ? 'success' : isCancelled ? 'neutral' : 'brand'} dot className="text-[10px]">
          {isConfirmed ? (isEn ? 'CONFIRMED' : 'DIKONFIRMASI') : isCancelled ? (isEn ? 'CANCELLED' : 'DIBATALKAN') : (isEn ? 'DRAFT' : 'DRAF')}
        </Badge>
      </div>

      {/* Rincian Pesanan Box - Typography-First, Clean Key-Value */}
      <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/60 p-3 text-[12px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          {isEn ? 'ORDER DETAILS' : 'RINCIAN PESANAN'}
        </div>

        {/* Origin / Pickup */}
        {details.origin && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Pickup' : 'Jemput'}</span>
            <span className="font-semibold text-ink text-right break-words">{details.origin}</span>
          </div>
        )}

        {/* Destination / Dropoff / Address */}
        {(details.destination || details.address) && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">
              {details.origin ? (isEn ? 'Destination' : 'Tujuan') : (isEn ? 'Location' : 'Lokasi')}
            </span>
            <span className="font-semibold text-ink text-right break-words">{details.destination || details.address}</span>
          </div>
        )}

        {/* Food Items / Services */}
        {details.items && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Items' : 'Menu / Item'}</span>
            <span className="font-semibold text-ink text-right break-words">{details.items}</span>
          </div>
        )}

        {/* Villa Name / Nights */}
        {details.villaName && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Property' : 'Properti'}</span>
            <span className="font-semibold text-ink text-right break-words">
              {details.villaName} ({details.nights || 1} {isEn ? 'night' : 'malam'}, {details.guests || 2} {isEn ? 'guests' : 'tamu'})
            </span>
          </div>
        )}

        {/* Problem description or subType */}
        {(details.problemDescription || details.serviceCategory) && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Scope' : 'Layanan'}</span>
            <span className="font-semibold text-ink text-right break-words">{details.problemDescription || details.serviceCategory}</span>
          </div>
        )}

        {/* Schedule / Time */}
        {(details.date || details.time) && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Schedule' : 'Jadwal'}</span>
            <span className="font-semibold text-ink text-right">
              {details.date} {details.time ? `• ${details.time}` : ''}
            </span>
          </div>
        )}

        {/* Notes */}
        {details.notes && (
          <div className="pt-0.5 text-[11px] text-ink-muted italic">
            &ldquo;{details.notes}&rdquo;
          </div>
        )}
      </div>

      {/* Estimasi Tarif */}
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-[12px] font-medium text-ink-muted">
          {isEn ? 'Estimated Total:' : 'Estimasi Total:'}
        </span>
        <div className="text-right">
          <Money value={draft.priceEstimate} className="text-[15px] font-mono font-extrabold text-brand-ink" />
        </div>
      </div>

      {/* Payment Method Selector (Only in draft mode) - Clean Minimal Pills */}
      {!isConfirmed && !isCancelled && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              {isEn ? 'PAYMENT' : 'PEMBAYARAN'}
            </span>
            <span className="text-[10.5px] text-ink-muted">
              {paymentMethod === 'cash' ? (isEn ? 'Pay on site' : 'Bayar di lokasi') : (isEn ? 'QRIS Scan' : 'Scan QRIS')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => onSelectPayment(draft.draftId, 'cash')}
              className={`min-h-10 flex items-center justify-center rounded-control border px-3 py-2 text-xs font-bold transition ${
                paymentMethod === 'cash'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <span>{isEn ? 'Cash' : 'Tunai'}</span>
            </button>
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => onSelectPayment(draft.draftId, 'qris')}
              className={`min-h-10 flex items-center justify-center rounded-control border px-3 py-2 text-xs font-bold transition ${
                paymentMethod === 'qris'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <span>QRIS</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons for DRAFT state - Clean Typography, No Emojis */}
      {!isConfirmed && !isCancelled && (
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => onConfirm(draft, paymentMethod)}
            className="min-h-11 flex w-full items-center justify-center gap-2 rounded-control bg-brand px-4 py-2.5 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
          >
            {isConfirming ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>{isEn ? 'Dispatching...' : 'Menghubungkan ke Mitra...'}</span>
              </>
            ) : (
              <span>{isEn ? 'Confirm & Order Now' : 'Konfirmasi & Pesan Sekarang'}</span>
            )}
          </button>
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => onCancel(draft.draftId)}
            className="min-h-10 flex w-full items-center justify-center rounded-control border border-line bg-card px-4 py-2 text-xs font-semibold text-ink-muted transition hover:bg-sunken hover:text-ink disabled:opacity-50"
          >
            <span>{isEn ? 'Cancel' : 'Batalkan'}</span>
          </button>
        </div>
      )}

      {/* Action Banner for CONFIRMED state */}
      {isConfirmed && confirmedOrder && (
        <div className="flex flex-col gap-2.5 rounded-control border border-success-line bg-success-soft p-3 text-ink">
          <div className="flex items-center gap-2 text-success font-extrabold text-[13px]">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{isEn ? 'Order Confirmed!' : 'Pesanan Dikonfirmasi!'}</span>
          </div>
          <p className="text-[11.5px] text-ink leading-relaxed">
            {isEn
              ? 'Your booking is live and being dispatched to the nearest partner.'
              : 'Pesanan Anda telah aktif dan sedang disalurkan ke mitra terdekat.'}
          </p>
          <button
            type="button"
            onClick={() => onTrack(confirmedOrder.id)}
            className="min-h-11 flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-brand-hover"
          >
            <span>{isEn ? 'Track Order →' : 'Lacak Pesanan →'}</span>
            <ExternalLink size={13} />
          </button>
        </div>
      )}

      {/* Action Banner for CANCELLED state */}
      {isCancelled && (
        <div className="rounded-control border border-line bg-sunken p-2.5 text-center text-xs font-semibold text-ink-muted">
          {isEn ? 'Draft was cancelled.' : 'Draf pesanan telah dibatalkan.'}
        </div>
      )}
    </div>
  );
}

export default function AIAssistantSheet({ open, onClose }) {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const { orders = [], refreshOrders } = useOrders() || {};
  const navigate = useNavigate();

  const isEn = lang === 'en';
  const initialGreeting = isEn
    ? 'Hello! I am your Wira AI Concierge. You can ask for recommendations or directly instruct me to book rides, food, courier, villas, waste, pool, technicians, or babysitters. How can I help you today?'
    : 'Halo! Saya Asisten Wira AI. Anda bisa bertanya rekomendasi atau langsung menyuruh saya memesan ojek, makanan, kurir, villa, sampah, kolam renang, tukang/excavator, atau babysitter. Ada yang bisa saya siapkan sekarang?';

  // Persistence keys
  const storageKey = `wira_ai_chat_v1_${user?.id || 'guest'}`;
  const draftsStorageKey = `wira_ai_drafts_v1_${user?.id || 'guest'}`;

  // Initialize messages from localStorage
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return [
      {
        id: 'welcome',
        sender: 'bot',
        text: initialGreeting,
        widgets: [],
      },
    ];
  });

  const [draftStates, setDraftStates] = useState(() => {
    try {
      const saved = localStorage.getItem(draftsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return {};
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Switch storage when user changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          const savedDrafts = localStorage.getItem(draftsStorageKey);
          if (savedDrafts) {
            setDraftStates(JSON.parse(savedDrafts) || {});
          }
          return;
        }
      }
    } catch { /* ignore */ }

    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: initialGreeting,
        widgets: [],
      },
    ]);
    setDraftStates({});
  }, [storageKey, draftsStorageKey, initialGreeting]);

  // Persist messages to localStorage
  useEffect(() => {
    try {
      const toSave = messages.slice(-40);
      localStorage.setItem(storageKey, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [messages, storageKey]);

  // Persist draftStates to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(draftsStorageKey, JSON.stringify(draftStates));
    } catch { /* ignore */ }
  }, [draftStates, draftsStorageKey]);

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
  }, [messages, isLoading, draftStates]);

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

  const handleSelectPayment = (draftId, method) => {
    setDraftStates((prev) => ({
      ...prev,
      [draftId]: {
        ...(prev[draftId] || { status: 'draft' }),
        paymentMethod: method,
      },
    }));
  };

  const handleConfirmDraft = async (draft, paymentMethod) => {
    const draftId = draft.draftId;
    if (draftStates[draftId]?.status === 'confirming' || draftStates[draftId]?.status === 'confirmed') {
      return;
    }
    setDraftStates((prev) => ({
      ...prev,
      [draftId]: {
        ...(prev[draftId] || {}),
        status: 'confirming',
      },
    }));

    try {
      const result = await confirmAssistantBooking({
        draft,
        userId: user?.id,
        paymentMethod,
      });

      if (result && result.success && result.orderId) {
        setDraftStates((prev) => ({
          ...prev,
          [draftId]: {
            status: 'confirmed',
            paymentMethod,
            confirmedOrder: result.order || { id: result.orderId },
            trackingUrl: result.trackingUrl,
          },
        }));

        refreshOrders?.();
        toast.success(isEn ? 'Order confirmed and dispatched!' : 'Pesanan berhasil dikonfirmasi!');
      } else {
        throw new Error(result?.message || 'Gagal memproses pesanan.');
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      setDraftStates((prev) => ({
        ...prev,
        [draftId]: {
          ...(prev[draftId] || {}),
          status: 'draft',
        },
      }));
      toast.error(err.message || (isEn ? 'Failed to confirm order.' : 'Gagal mengonfirmasi pesanan.'));
    }
  };

  const handleCancelDraft = (draftId) => {
    setDraftStates((prev) => ({
      ...prev,
      [draftId]: {
        ...(prev[draftId] || {}),
        status: 'cancelled',
      },
    }));
    toast(isEn ? 'Draft cancelled.' : 'Draf pesanan dibatalkan.');
  };

  const handleTrackOrder = (orderId) => {
    onClose();
    navigate(`/active-order/${orderId}`);
  };

  const handleReset = () => {
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(draftsStorageKey);
    } catch { /* ignore */ }

    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: initialGreeting,
        widgets: [],
      },
    ]);
    setDraftStates({});
    toast.success(isEn ? 'Conversation history cleared.' : 'Riwayat percakapan telah dibersihkan.');
  };

  // Clean, minimal text chips without emojis
  const quickChips = [
    { label: isEn ? 'Motorbike Ride' : 'Pesan Ojek Motor', query: isEn ? 'Order a motorbike ride to Kuta Beach pickup at Airport now' : 'pesenin ojek motor ke Pantai Kuta jemput di Bandara sekarang' },
    { label: isEn ? 'Ayam Taliwang' : 'Ayam Taliwang Bu Mirah', query: isEn ? 'Order Ayam Taliwang Bu Mirah 2 portions' : 'pesen Ayam Taliwang Bu Mirah 2 porsi' },
    { label: isEn ? 'Private Villa' : 'Sewa Villa Talas', query: isEn ? 'Rent a room at Villa Talas for 2 nights' : 'sewa kamar di Villa Talas buat 2 malam' },
    { label: isEn ? 'Mini Excavator' : 'Sewa Excavator Praya', query: isEn ? 'Rent mini excavator in Praya' : 'sewa excavator mini di Praya' },
    { label: isEn ? 'Pool Care' : 'Kuras Kolam Villa', query: isEn ? 'Clean and drain villa pool' : 'kuras kolam villa' },
    { label: isEn ? 'Waste Pickup' : 'Angkut Sampah', query: isEn ? 'Pickup villa waste with Sampun Bersih' : 'angkut sampah villa' },
    { label: isEn ? 'AC Technician' : 'Servis AC Villa', query: isEn ? 'Call AC technician tomorrow morning' : 'panggil tukang AC besok pagi' },
    { label: isEn ? 'Babysitter' : 'Pengasuh Balita', query: isEn ? 'Find a babysitter to take care of toddler' : 'cari baby sitter jagain balita' },
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
        <div className="h-1.5 tenun-band shrink-0" aria-hidden="true" />

        {/* Clean, Elegant Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-extrabold tracking-tight text-ink">Wira AI</h3>
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            <span className="text-[11.5px] text-ink-muted ml-1">
              {isEn ? 'Assistant' : 'Asisten'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              title={isEn ? 'Clear history / Start new' : 'Hapus riwayat / Mulai baru'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-muted transition hover:bg-sunken hover:text-ink"
            >
              <RotateCcw size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={t('common.close')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-muted transition hover:bg-sunken hover:text-ink"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips - Clean, Minimal Pills without Emojis */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-line bg-sunken/40 px-4 py-2 sm:px-6">
          {quickChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleSend(chip.query)}
              disabled={isLoading}
              className="inline-flex shrink-0 items-center rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand-ink disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat Scrollable Container - Clean Bubbles without Noisy Avatars */}
        <div className="custom-scroll flex h-[50vh] min-h-[340px] max-h-[520px] flex-col gap-3 overflow-y-auto p-4 sm:p-6 text-[13px]">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex flex-col gap-2 max-w-[88%] sm:max-w-[80%] ${
                    isUser
                      ? 'rounded-card rounded-tr-sm bg-brand px-3.5 py-2.5 text-white font-medium shadow-sm'
                      : 'rounded-card rounded-tl-sm border border-line bg-sunken p-3 text-ink shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                  {/* Render Rich Action Widgets if attached */}
                  {!isUser && msg.widgets && msg.widgets.length > 0 && (
                    <div className="flex flex-col gap-2.5 pt-1">
                      {msg.widgets.map((widget, widx) => {
                        // 1. Direct Booking Draft Card Widget
                        if (widget.type === 'booking_draft') {
                          return (
                            <BookingDraftCard
                              key={`${msg.id}-draft-${widget.draftId || widx}`}
                              draft={widget}
                              state={draftStates[widget.draftId] || {}}
                              onSelectPayment={handleSelectPayment}
                              onConfirm={handleConfirmDraft}
                              onCancel={handleCancelDraft}
                              onTrack={handleTrackOrder}
                              isEn={isEn}
                            />
                          );
                        }

                        // 2. Existing standard widgets (Villa, Food, Tracking, Service, Ride)
                        return (
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
                                    <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur">
                                      ★ {widget.rating || '4.9'}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-[13.5px] font-extrabold text-ink truncate">{widget.title}</h4>
                                    <p className="text-[11px] text-ink-muted truncate">{widget.address}</p>
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
                                  className="min-h-10 inline-flex w-full items-center justify-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || (isEn ? 'View Villa' : 'Lihat Villa')}</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}

                            {/* Widget Type: Food */}
                            {widget.type === 'food' && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2.5">
                                  {widget.image && (
                                    <img
                                      src={widget.image}
                                      alt={widget.title}
                                      className="h-11 w-11 rounded-tile object-cover shrink-0"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <h4 className="text-[13px] font-extrabold text-ink truncate">{widget.title}</h4>
                                    <p className="text-[11px] text-ink-muted truncate">{widget.address || widget.category}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    navigate(widget.ctaPath || '/food');
                                  }}
                                  className="min-h-10 inline-flex w-full items-center justify-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || (isEn ? 'Explore Menu' : 'Buka Menu')}</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}

                            {/* Widget Type: Tracking */}
                            {widget.type === 'tracking' && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-success uppercase">
                                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
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
                                  className="min-h-10 inline-flex w-full items-center justify-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || (isEn ? 'Live Map Tracking' : 'Lacak Driver')}</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}

                            {/* Widget Type: Service (Excavator / Pool / Bersih) */}
                            {widget.type === 'service' && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <h4 className="text-[13px] font-extrabold text-ink">{widget.title}</h4>
                                    <p className="text-[11px] text-ink-muted leading-tight">{widget.subtitle}</p>
                                  </div>
                                  {widget.price && (
                                    <div className="text-right shrink-0">
                                      <Money value={widget.price} className="text-[13px] font-bold text-brand-ink" />
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
                                  className="min-h-10 inline-flex w-full items-center justify-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || (isEn ? 'Order Service' : 'Pesan Layanan')}</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}

                            {/* Widget Type: Ride */}
                            {widget.type === 'ride' && (
                              <div className="flex flex-col gap-2">
                                <div>
                                  <h4 className="text-[13px] font-extrabold text-ink">{widget.title}</h4>
                                  <p className="text-[11px] text-ink-muted">{widget.subtitle}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    navigate('/ride');
                                  }}
                                  className="min-h-10 inline-flex w-full items-center justify-center gap-1 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || 'Buka WiraRide →'}</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator - Clean Minimal Dots */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-card rounded-tl-sm border border-line bg-sunken px-3.5 py-2.5 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-muted animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar - Clean Minimal Design */}
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
              placeholder={isEn ? 'Ask or instruct: "Book ride to Kuta", "Clean pool"...' : 'Ketik pertanyaan atau perintah pemesanan...'}
              disabled={isLoading}
              className="flex-1 min-h-11 rounded-control border border-line bg-ground px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none transition disabled:opacity-50"
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
