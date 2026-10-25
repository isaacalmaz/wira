import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  MapPin,
  ExternalLink,
  Bike,
  Car,
  UtensilsCrossed,
  Package,
  Home,
  Waves,
  Wrench,
  Baby,
  Trash2,
  CheckCircle2,
  Clock,
  QrCode,
  Banknote,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { sendAssistantMessage, confirmAssistantBooking } from '../../services/aiAssistantService';
import { Sheet, Money, Badge, IconTile } from '../ui';

function getServiceIcon(serviceType, details) {
  if (serviceType === 'ride') {
    return details?.vehicleType === 'car' ? Car : Bike;
  }
  if (serviceType === 'food') return UtensilsCrossed;
  if (serviceType === 'send') return Package;
  if (serviceType === 'villa') return Home;
  if (serviceType === 'bersih') {
    return details?.subType === 'housekeeping' ? Sparkles : Trash2;
  }
  if (serviceType === 'pool') return Waves;
  if (serviceType === 'service') return Wrench;
  if (serviceType === 'asuh' || serviceType === 'babysit') return Baby;
  return Sparkles;
}

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

  const ServiceIcon = getServiceIcon(draft.serviceType, draft.details);
  const details = draft.details || {};

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-card p-3.5 sm:p-4 text-ink shadow-sm transition">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconTile tone="brand" size="md">
            <ServiceIcon size={18} aria-hidden="true" />
          </IconTile>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-[14px] font-extrabold text-ink leading-tight">{draft.serviceName}</h4>
              <Badge tone={isConfirmed ? 'success' : isCancelled ? 'neutral' : 'brand'} dot className="text-[10px]">
                {isConfirmed ? (isEn ? 'CONFIRMED' : 'DIKONFIRMASI') : isCancelled ? (isEn ? 'CANCELLED' : 'DIBATALKAN') : (isEn ? 'DRAFT' : 'DRAF PESANAN')}
              </Badge>
            </div>
            <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{draft.subtitle || draft.title}</p>
          </div>
        </div>
      </div>

      {/* Rincian Pesanan Box */}
      <div className="flex flex-col gap-2 rounded-control border border-line bg-sunken/60 p-3 text-[12px]">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
          {isEn ? 'ORDER DETAILS' : 'RINCIAN PESANAN'}
        </div>

        {/* Origin / Pickup */}
        {details.origin && (
          <div className="flex items-start gap-2">
            <MapPin size={13} className="shrink-0 text-brand-ink mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10.5px] text-ink-muted block">{isEn ? 'Pickup Location:' : 'Titik Jemput / Asal:'}</span>
              <span className="font-semibold text-ink break-words">{details.origin}</span>
            </div>
          </div>
        )}

        {/* Destination / Dropoff / Address */}
        {(details.destination || details.address) && (
          <div className="flex items-start gap-2">
            <MapPin size={13} className="shrink-0 text-danger mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10.5px] text-ink-muted block">
                {details.origin ? (isEn ? 'Destination:' : 'Tujuan / Alamat:') : (isEn ? 'Service Location:' : 'Lokasi Layanan:')}
              </span>
              <span className="font-semibold text-ink break-words">{details.destination || details.address}</span>
            </div>
          </div>
        )}

        {/* Food Items / Services */}
        {details.items && (
          <div className="flex items-start gap-2">
            <ShoppingBag size={13} className="shrink-0 text-brand-ink mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10.5px] text-ink-muted block">{isEn ? 'Items / Order:' : 'Menu / Barang:'}</span>
              <span className="font-semibold text-ink break-words">{details.items}</span>
            </div>
          </div>
        )}

        {/* Villa Name / Nights */}
        {details.villaName && (
          <div className="flex items-start gap-2">
            <Home size={13} className="shrink-0 text-brand-ink mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10.5px] text-ink-muted block">{isEn ? 'Accommodation:' : 'Properti:'}</span>
              <span className="font-semibold text-ink break-words">
                {details.villaName} ({details.nights || 1} {isEn ? 'night' : 'malam'}, {details.guests || 2} {isEn ? 'guests' : 'tamu'})
              </span>
            </div>
          </div>
        )}

        {/* Problem description or subType */}
        {(details.problemDescription || details.serviceCategory) && (
          <div className="flex items-start gap-2">
            <CheckCircle2 size={13} className="shrink-0 text-brand-ink mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10.5px] text-ink-muted block">{isEn ? 'Service Scope:' : 'Lingkup Layanan:'}</span>
              <span className="font-semibold text-ink break-words">{details.problemDescription || details.serviceCategory}</span>
            </div>
          </div>
        )}

        {/* Schedule / Time */}
        {(details.date || details.time) && (
          <div className="flex items-center gap-2">
            <Clock size={13} className="shrink-0 text-ink-muted" />
            <span className="text-ink font-medium">
              {details.date} {details.time ? `• ${details.time}` : ''}
            </span>
          </div>
        )}

        {/* Notes */}
        {details.notes && (
          <div className="border-t border-line/60 pt-1 text-[11px] text-ink-muted italic">
            &ldquo;{details.notes}&rdquo;
          </div>
        )}
      </div>

      {/* Estimasi Tarif */}
      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[12.5px] font-semibold text-ink-muted">
          {isEn ? 'Estimated Total:' : 'Estimasi Tarif:'}
        </span>
        <div className="text-right">
          <Money value={draft.priceEstimate} className="text-[16px] font-mono font-extrabold text-brand-ink" />
        </div>
      </div>

      {/* Payment Method Selector (Only in draft mode) */}
      {!isConfirmed && !isCancelled && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
              {isEn ? 'PAYMENT METHOD' : 'METODE PEMBAYARAN'}
            </span>
            <span className="text-[10px] text-ink-muted">
              {paymentMethod === 'cash' ? (isEn ? 'Pay to partner on site' : 'Bayar ke mitra di lokasi') : (isEn ? 'Instant QRIS scan' : 'Scan QRIS instan')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => onSelectPayment(draft.draftId, 'cash')}
              className={`min-h-11 flex items-center justify-center gap-2 rounded-control border px-3 py-2 text-xs font-bold transition ${
                paymentMethod === 'cash'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <Banknote size={15} />
              <span>{isEn ? 'Cash (Tunai)' : 'Tunai (Cash)'}</span>
            </button>
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => onSelectPayment(draft.draftId, 'qris')}
              className={`min-h-11 flex items-center justify-center gap-2 rounded-control border px-3 py-2 text-xs font-bold transition ${
                paymentMethod === 'qris'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <QrCode size={15} />
              <span>QRIS</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons for DRAFT state */}
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
                <Loader2 size={16} className="animate-spin" />
                <span>{isEn ? 'Dispatching to Partner...' : 'Menghubungkan ke Mitra...'}</span>
              </>
            ) : (
              <>
                <span>✅</span>
                <span>{isEn ? 'Confirm & Order Now' : 'Konfirmasi & Pesan Sekarang'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => onCancel(draft.draftId)}
            className="min-h-11 flex w-full items-center justify-center rounded-control border border-line bg-card px-4 py-2 text-xs font-bold text-ink-muted transition hover:bg-sunken hover:text-ink disabled:opacity-50"
          >
            <span>✕ {isEn ? 'Cancel Draft' : 'Batalkan'}</span>
          </button>
        </div>
      )}

      {/* Action Banner for CONFIRMED state */}
      {isConfirmed && confirmedOrder && (
        <div className="flex flex-col gap-2.5 rounded-control border border-success-line bg-success-soft p-3 text-ink">
          <div className="flex items-center gap-2 text-success font-extrabold text-[13px]">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{isEn ? 'Order Dispatched Successfully!' : 'Pesanan Berhasil Dikonfirmasi!'}</span>
          </div>
          <p className="text-[11.5px] text-ink leading-relaxed">
            {isEn
              ? 'Your booking is live in the system and being assigned to the nearest verified partner in Lombok.'
              : 'Pesanan Anda telah aktif dan sedang disalurkan ke mitra terdekat di Lombok.'}
          </p>
          <button
            type="button"
            onClick={() => onTrack(confirmedOrder.id)}
            className="min-h-11 flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-brand-hover"
          >
            <span>{isEn ? 'Track Order Live →' : '🛵 Lacak Pesanan Langsung →'}</span>
            <ExternalLink size={13} />
          </button>
        </div>
      )}

      {/* Action Banner for CANCELLED state */}
      {isCancelled && (
        <div className="rounded-control border border-line bg-sunken p-2.5 text-center text-xs font-semibold text-ink-muted">
          {isEn ? 'Draft was cancelled. You can ask anytime to order again.' : 'Draf pesanan telah dibatalkan. Anda bisa meminta pemesanan kembali kapan saja.'}
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
    ? 'Hello! I am your Wira AI Concierge. I can help you order rides, food, courier, villas, housekeeping, pool maintenance, technicians, or babysitters with 1 tap. How can I help you today?'
    : 'Halo! Saya Asisten Wira AI. Anda bisa memesan langsung ojek, makanan, paket, villa, sampah, kolam renang, tukang/excavator, atau babysitter tanpa ribet. Ada yang bisa saya siapkan sekarang?';

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
  const [draftStates, setDraftStates] = useState({});

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
    toast(isEn ? 'Draft cancelled.' : 'Draf pesanan dibatalkan.', { icon: '✕' });
  };

  const handleTrackOrder = (orderId) => {
    onClose();
    navigate(`/active-order/${orderId}`);
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
    setDraftStates({});
  };

  const quickChips = [
    { label: isEn ? '🛵 Motor to Kuta Beach' : '🛵 Ojek ke Pantai Kuta', query: isEn ? 'Order a motorbike ride to Kuta Beach pickup at Airport now' : 'pesenin ojek motor ke Pantai Kuta jemput di Bandara sekarang' },
    { label: isEn ? '🍗 Best Taliwang Food' : '🍗 Ayam Taliwang Bu Mirah', query: isEn ? 'Order Ayam Taliwang Bu Mirah 2 portions' : 'pesen Ayam Taliwang Bu Mirah 2 porsi' },
    { label: isEn ? '🏖️ Private Villa' : '🏖️ Villa Talas 2 Malam', query: isEn ? 'Rent a room at Villa Talas for 2 nights' : 'sewa kamar di Villa Talas buat 2 malam' },
    { label: isEn ? '🚜 Mini Excavator' : '🚜 Sewa Excavator Praya', query: isEn ? 'Rent mini excavator in Praya' : 'sewa excavator mini di Praya' },
    { label: isEn ? '🏊 Clean Villa Pool' : '🏊 Kuras Kolam Villa', query: isEn ? 'Clean and drain villa pool' : 'kuras kolam villa' },
    { label: isEn ? '🧹 Villa Waste Pickup' : '🧹 Angkut Sampah Villa', query: isEn ? 'Pickup villa waste with Sampun Bersih' : 'angkut sampah villa' },
    { label: isEn ? '🔧 AC Technician' : '🔧 Tukang AC Besok', query: isEn ? 'Call AC technician tomorrow morning' : 'panggil tukang AC besok pagi' },
    { label: isEn ? '👶 Babysitter' : '👶 Jaga Balita', query: isEn ? 'Find a babysitter to take care of toddler' : 'cari baby sitter jagain balita' },
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
                {isEn ? 'Direct Hands-Free Ordering for All 8 Wira Services' : 'Pesan Langsung Tanpa Ribet untuk Semua 8 Layanan Wira'}
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
                  className={`flex flex-col gap-2.5 max-w-[88%] sm:max-w-[82%] ${
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

                        // 2. Existing standard widgets
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
                                  className="min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
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
                                  className="min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
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
                                  className="min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
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
                                  className="min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
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
                                  className="min-h-11 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover"
                                >
                                  <span>{widget.ctaText || 'Buka WiraRide →'}</span>
                                  <ExternalLink size={13} />
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
              placeholder={isEn ? 'Ask or instruct: "Book motorbike ride to Kuta", "Clean pool"...' : 'Perintahkan asisten: "pesen ojek ke Kuta", "kuras kolam", "sewa excavator"...'}
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
