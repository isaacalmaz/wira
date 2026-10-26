import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  RotateCcw,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Mic,
  Volume2,
  VolumeX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { sendAssistantMessage, confirmAssistantBooking } from '../../services/aiAssistantService';
import { Sheet, Money, Badge } from '../ui';
import {
  speakText,
  cancelSpeech,
  getSpeechRecognitionClass,
  primeSpeechSynthesis,
} from './speechUtils';

function BookingDraftCard({
  draft,
  state = {},
  onSelectPayment,
  onConfirm,
  onCancel,
  onTrack,
  onOpenRoute,
  isEn,
}) {
  const currentStatus = state.status || 'draft';
  const paymentMethod = state.paymentMethod || draft.paymentMethod || 'cash';
  const confirmedOrder = state.confirmedOrder;
  const isConfirming = currentStatus === 'confirming';
  const isConfirmed = currentStatus === 'confirmed';
  const isCancelled = currentStatus === 'cancelled';
  const details = draft.details || {};

  const isRide = draft.serviceType === 'ride';
  const [selectedVehicle, setSelectedVehicle] = useState(details.vehicleType || 'motor');

  // Compute live price based on selected vehicle if ride
  const motorPrice = details.motorPrice || (details.vehicleType === 'motor' ? draft.priceEstimate : 12000);
  const carPrice = details.carPrice || (details.vehicleType === 'car' ? draft.priceEstimate : 25000);
  const currentPrice = isRide
    ? (selectedVehicle === 'car' ? carPrice : motorPrice)
    : draft.priceEstimate;

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

        {/* Distance & ETA */}
        {details.distanceKm && (
          <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
            <span className="text-[11px] text-ink-muted shrink-0">{isEn ? 'Distance & ETA' : 'Jarak & Estimasi'}</span>
            <span className="font-semibold text-ink text-right">
              {details.distanceKm} km {details.durationMins ? `• ~${details.durationMins} ${isEn ? 'mins' : 'mnt'}` : ''}
            </span>
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

        {/* Deep Link to Ride Portal Route */}
        {details.routeUrl && onOpenRoute && (
          <button
            type="button"
            onClick={() => onOpenRoute(details.routeUrl)}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-control border border-line bg-card py-2 px-3 text-[11px] font-bold text-brand transition hover:bg-brand-soft"
          >
            <span>{isEn ? 'View Route on Ride Portal Map' : 'Lihat Rute di Peta Portal Ride'}</span>
            <ExternalLink size={13} />
          </button>
        )}
      </div>

      {/* Estimasi Tarif */}
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-[12px] font-medium text-ink-muted">
          {isEn ? 'Estimated Total:' : 'Estimasi Total:'}
        </span>
        <div className="text-right">
          <Money value={currentPrice} className="text-[15px] font-mono font-extrabold text-brand-ink" />
        </div>
      </div>

      {/* Vehicle Type Selector (Only in draft mode for Ride) */}
      {isRide && !isConfirmed && !isCancelled && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              {isEn ? 'VEHICLE TYPE' : 'PILIHAN KENDARAAN'}
            </span>
            <span className="text-[10.5px] text-ink-muted">
              {selectedVehicle === 'car' ? (isEn ? 'WiraRide Car' : 'WiraRide Mobil') : (isEn ? 'WiraRide Motor' : 'WiraRide Motor')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => setSelectedVehicle('motor')}
              className={`min-h-10 flex flex-col items-center justify-center rounded-control border p-1.5 text-xs transition ${
                selectedVehicle === 'motor'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <span className="font-bold">{isEn ? 'Motorbike' : 'Motor'}</span>
              <span className={`text-[10.5px] ${selectedVehicle === 'motor' ? 'text-white/90' : 'text-ink-muted'}`}>
                Rp {motorPrice.toLocaleString('id-ID')}
              </span>
            </button>
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => setSelectedVehicle('car')}
              className={`min-h-10 flex flex-col items-center justify-center rounded-control border p-1.5 text-xs transition ${
                selectedVehicle === 'car'
                  ? 'border-brand bg-brand text-white shadow-sm'
                  : 'border-line bg-card text-ink hover:bg-sunken'
              }`}
            >
              <span className="font-bold">{isEn ? 'Car' : 'Mobil'}</span>
              <span className={`text-[10.5px] ${selectedVehicle === 'car' ? 'text-white/90' : 'text-ink-muted'}`}>
                Rp {carPrice.toLocaleString('id-ID')}
              </span>
            </button>
          </div>
        </div>
      )}

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
            onClick={() =>
              onConfirm(
                {
                  ...draft,
                  priceEstimate: currentPrice,
                  serviceName: isRide
                    ? (selectedVehicle === 'car' ? (isEn ? 'WiraRide (Car)' : 'WiraRide (Mobil)') : (isEn ? 'WiraRide (Motor)' : 'WiraRide (Motor)'))
                    : draft.serviceName,
                  details: {
                    ...details,
                    vehicleType: selectedVehicle,
                  },
                },
                paymentMethod
              )
            }
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

export default function AIAssistantSheet({ open, onClose, autoListen = false }) {
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
          return parsed.map((m) => ({
            ...m,
            widgets: Array.isArray(m?.widgets)
              ? m.widgets.filter((w) => Boolean(w && typeof w === 'object' && w.type))
              : [],
          }));
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
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [currentGps, setCurrentGps] = useState(() => {
    try {
      const cached = localStorage.getItem('wira_user_last_gps');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('wira_ai_voice_enabled');
      // Default to true (voice-first enabled) unless user explicitly muted it ('false')
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Pre-load saved addresses & current GPS for contextual resolution
  useEffect(() => {
    if (!user?.id) return;
    import('../../config/supabase').then(({ supabase }) => {
      supabase
        .from('saved_addresses')
        .select('id, label, address, lat, lng, is_primary, note')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) setSavedAddresses(data);
        });
    });
  }, [user?.id]);

  const refreshGps = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data && data.display_name) {
              const parts = data.display_name.split(',');
              const shortName = parts.slice(0, 3).join(',').trim();
              const gpsObj = { lat, lng, address: shortName };
              setCurrentGps(gpsObj);
              try {
                localStorage.setItem('wira_user_last_gps', JSON.stringify(gpsObj));
              } catch (_) {}
            } else {
              const gpsObj = { lat, lng, address: 'Lokasi Anda Saat Ini' };
              setCurrentGps(gpsObj);
              try {
                localStorage.setItem('wira_user_last_gps', JSON.stringify(gpsObj));
              } catch (_) {}
            }
          } catch {
            const fallbackGps = { lat, lng, address: 'Lokasi Anda Saat Ini' };
            setCurrentGps((prev) => prev || fallbackGps);
            try {
              localStorage.setItem('wira_user_last_gps', JSON.stringify(fallbackGps));
            } catch (_) {}
          }
        },
        () => { /* silent fallback */ },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    }
  }, []);

  useEffect(() => {
    refreshGps();
  }, [refreshGps]);

  useEffect(() => {
    if (open && !currentGps) {
      refreshGps();
    }
  }, [open, currentGps, refreshGps]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastCapturedTextRef = useRef('');
  const isAbortedRef = useRef(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const stopListening = useCallback((abort = true) => {
    isAbortedRef.current = abort;
    if (abort) {
      lastCapturedTextRef.current = '';
    }
    if (recognitionRef.current) {
      try {
        if (abort) {
          recognitionRef.current.abort();
        } else {
          recognitionRef.current.stop();
        }
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const stopAllVoice = useCallback(() => {
    stopListening(true);
    cancelSpeech();
    setIsSpeaking(false);
  }, [stopListening]);

  const speakAssistantReply = useCallback((text) => {
    cancelSpeech();
    const utt = speakText(text, {
      lang: isEn ? 'en-US' : 'id-ID',
      isEn,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
    if (!utt) {
      setIsSpeaking(false);
    }
  }, [isEn]);

  const toggleVoiceEnabled = () => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wira_ai_voice_enabled', String(next));
      } catch { /* ignore */ }
      if (!next) {
        cancelSpeech();
        setIsSpeaking(false);
      } else {
        primeSpeechSynthesis();
      }
      toast.success(
        next
          ? (isEn ? 'Voice replies enabled' : 'Suara asisten diaktifkan')
          : (isEn ? 'Voice replies muted' : 'Suara asisten dimatikan')
      );
      return next;
    });
  };

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
          const cleaned = parsed.map((m) => ({
            ...m,
            widgets: Array.isArray(m?.widgets)
              ? m.widgets.filter((w) => Boolean(w && typeof w === 'object' && w.type))
              : [],
          }));
          setMessages(cleaned);
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
    } else {
      stopAllVoice();
    }
  }, [open, stopAllVoice]);

  useEffect(() => {
    return () => {
      stopAllVoice();
    };
  }, [stopAllVoice]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, draftStates]);

  const handleSend = async (queryText, isVoiceTriggered = false) => {
    stopListening(true);
    cancelSpeech();
    setIsSpeaking(false);

    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isLoading) return;

    const shouldSpeak = voiceEnabled || isVoiceTriggered;

    const userMsgId = `user-${Date.now()}`;
    const newMessages = [
      ...messages,
      { id: userMsgId, sender: 'user', text: textToSend, widgets: [] },
    ];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      let effectiveLocation = currentGps;
      if (!effectiveLocation?.lat || !effectiveLocation?.lng) {
        // 1. Check if user's order history has a recent pickup location with lat/lng
        if (Array.isArray(orders) && orders.length > 0) {
          const lastOrder = orders.find((o) => o.pickup_lat && o.pickup_lng);
          if (lastOrder) {
            let origName = 'Lokasi Riwayat Penjemputan';
            try {
              const d = typeof lastOrder.details === 'object' ? lastOrder.details : JSON.parse(lastOrder.details || '{}');
              if (d && d.origin) origName = d.origin;
            } catch (_) {}
            effectiveLocation = {
              lat: Number(lastOrder.pickup_lat),
              lng: Number(lastOrder.pickup_lng),
              address: origName,
            };
          }
        }

        // 2. Check localStorage cached GPS
        if (!effectiveLocation) {
          try {
            const cached = localStorage.getItem('wira_user_last_gps');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed?.lat && parsed?.lng) effectiveLocation = parsed;
            }
          } catch (_) {}
        }

        // 3. Proactively attempt fast geolocation fix if available
        if (!effectiveLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 1500,
                maximumAge: 60000,
              });
            });
            if (pos && pos.coords) {
              effectiveLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                address: 'Lokasi Anda Saat Ini',
              };
              setCurrentGps(effectiveLocation);
              try {
                localStorage.setItem('wira_user_last_gps', JSON.stringify(effectiveLocation));
              } catch (_) {}
            }
          } catch (_) {}
        }
      }

      const res = await sendAssistantMessage({
        message: textToSend,
        userId: user?.id,
        lang,
        activeOrders: orders,
        userLocation: effectiveLocation,
        savedAddresses,
      });

      const replyText = (res && res.reply)
        ? res.reply
        : (isEn
            ? 'I received your request! You can explore our services directly from the menu.'
            : 'Permintaan Anda telah kami terima! Anda dapat melihat katalog layanan langsung dari menu.');

      const safeWidgets = Array.isArray(res?.widgets)
        ? res.widgets.filter((w) => Boolean(w && typeof w === 'object' && w.type))
        : [];

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: replyText,
          widgets: safeWidgets,
        },
      ]);

      if (shouldSpeak && openRef.current) {
        speakAssistantReply(replyText);
      }
    } catch {
      const errorText = isEn
        ? 'Sorry, I had trouble processing that. Please try again or tap one of the quick suggestions below.'
        : 'Maaf, terjadi kendala saat memproses jawaban. Silakan coba lagi atau pilih pertanyaan cepat di bawah.';

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          text: errorText,
          widgets: [],
        },
      ]);

      if (shouldSpeak && openRef.current) {
        speakAssistantReply(errorText);
      }
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

  const handleOpenRoute = (routeUrl) => {
    onClose();
    navigate(routeUrl);
  };

  const handleReset = () => {
    stopAllVoice();
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

  const ensureMicrophonePermission = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      }
    } catch (err) {
      console.warn('getUserMedia audio permission check:', err);
      return false;
    }
    return true;
  };

  const toggleListening = async () => {
    if (isListening) {
      // User tapped to finish speaking
      stopListening(false);
      return;
    }

    primeSpeechSynthesis();

    const SpeechRecognition = getSpeechRecognitionClass();

    if (!SpeechRecognition) {
      toast.error(
        isEn
          ? 'Voice recognition is not supported in this browser.'
          : 'Pengenalan suara tidak didukung di browser ini.'
      );
      return;
    }

    // Trigger Android / Browser OS permission prompt if not yet granted
    const hasPerm = await ensureMicrophonePermission();
    if (!hasPerm) {
      toast.error(
        isEn
          ? 'Microphone access denied. Please allow microphone permissions.'
          : 'Akses mikrofon ditolak. Izinkan izin mikrofon di pengaturan aplikasi.'
      );
      return;
    }

    cancelSpeech();
    setIsSpeaking(false);

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { /* ignore */ }
        recognitionRef.current = null;
      }

      isAbortedRef.current = false;
      lastCapturedTextRef.current = '';

      const recognition = new SpeechRecognition();
      recognition.lang = isEn ? 'en-US' : 'id-ID';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }
        const text = (final + interim).trim();
        if (text) {
          lastCapturedTextRef.current = text;
          setInputText(text);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        recognitionRef.current = null;
        isAbortedRef.current = true;
        lastCapturedTextRef.current = '';

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          toast.error(
            isEn
              ? 'Microphone access denied. Please allow microphone permissions.'
              : 'Akses mikrofon ditolak. Izinkan izin mikrofon di pengaturan browser.'
          );
        } else if (event.error === 'audio-capture') {
          toast.error(
            isEn
              ? 'No microphone found. Please connect a microphone.'
              : 'Mikrofon tidak ditemukan. Sambungkan mikrofon Anda.'
          );
        } else if (event.error === 'network') {
          toast.error(
            isEn
              ? 'Speech recognition network error. Check connection.'
              : 'Gangguan jaringan pada pengenalan suara. Periksa koneksi.'
          );
        } else if (event.error === 'no-speech') {
          // Silent or benign timeout, do not display alarming error
        } else if (event.error !== 'aborted') {
          toast.error(
            isEn
              ? 'Voice recognition error. Please try again.'
              : 'Kendala pengenalan suara. Silakan coba lagi.'
          );
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;

        if (isAbortedRef.current) {
          isAbortedRef.current = false;
          return;
        }

        const textToSubmit = lastCapturedTextRef.current.trim();
        lastCapturedTextRef.current = '';
        if (textToSubmit) {
          handleSend(textToSubmit, true);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
      recognitionRef.current = null;
      toast.error(
        isEn
          ? 'Failed to start voice recognition.'
          : 'Gagal mengaktifkan mikrofon.'
      );
    }
  };

  // Triggered by OS Homescreen Widget (Microphone tap) or Deep-Link
  const prevAutoListenRef = useRef(false);
  useEffect(() => {
    if (open && autoListen && !prevAutoListenRef.current) {
      prevAutoListenRef.current = true;
      const timer = setTimeout(() => {
        if (!isListening) {
          toggleListening();
        }
      }, 350);
      return () => clearTimeout(timer);
    }
    if (!open || !autoListen) {
      prevAutoListenRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoListen, isListening]);

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
            {isSpeaking && (
              <button
                type="button"
                onClick={() => {
                  cancelSpeech();
                  setIsSpeaking(false);
                }}
                title={isEn ? 'Stop speaking' : 'Hentikan suara'}
                aria-label={isEn ? 'Stop speaking' : 'Hentikan suara'}
                className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand transition hover:bg-brand hover:text-white"
              >
                <Volume2 size={11} aria-hidden="true" className="animate-pulse shrink-0" />
                <span>{isEn ? 'Speaking' : 'Berbicara'}</span>
                <span className="text-[9px] opacity-75 font-normal ml-0.5">✕</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleVoiceEnabled}
              title={
                voiceEnabled
                  ? (isEn ? 'Mute voice replies' : 'Matikan suara asisten')
                  : (isEn ? 'Enable voice replies' : 'Aktifkan suara asisten')
              }
              aria-label={voiceEnabled ? 'Mute voice replies' : 'Enable voice replies'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-control transition ${
                voiceEnabled
                  ? 'text-brand hover:bg-brand-soft'
                  : 'text-ink-muted hover:bg-sunken hover:text-ink'
              }`}
            >
              {voiceEnabled ? (
                <Volume2 size={15} aria-hidden="true" />
              ) : (
                <VolumeX size={15} aria-hidden="true" />
              )}
            </button>
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
              onClick={() => {
                primeSpeechSynthesis();
                handleSend(chip.query);
              }}
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
                  {!isUser && Array.isArray(msg.widgets) && msg.widgets.length > 0 && (
                    <div className="flex flex-col gap-2.5 pt-1">
                      {msg.widgets
                        .filter((widget) => Boolean(widget && typeof widget === 'object' && widget.type))
                        .map((widget, widx) => {
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
                              onOpenRoute={handleOpenRoute}
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
                                <div className="flex flex-col gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSend(isEn ? `Book ${widget.title} for 2 nights now` : `Pesan sewa ${widget.title} sekarang`);
                                    }}
                                    className="min-h-10 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover shadow-sm"
                                  >
                                    <span>{isEn ? 'Draft Booking in Chat' : 'Pesan Langsung di Sini'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate(widget.ctaPath || '/villa');
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-1 py-1 text-[11px] font-semibold text-ink-muted hover:text-brand"
                                  >
                                    <span>{widget.ctaText || (isEn ? 'View Villa in Catalog →' : 'Lihat Detail di Katalog →')}</span>
                                  </button>
                                </div>
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
                                <div className="flex flex-col gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSend(isEn ? `Order food from ${widget.title} now` : `Pesan makanan dari ${widget.title} sekarang`);
                                    }}
                                    className="min-h-10 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover shadow-sm"
                                  >
                                    <span>{isEn ? 'Order Directly in Chat' : 'Pesan Menu di Sini'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate(widget.ctaPath || '/food');
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-1 py-1 text-[11px] font-semibold text-ink-muted hover:text-brand"
                                  >
                                    <span>{widget.ctaText || (isEn ? 'Browse Full Menu →' : 'Buka Menu Lengkap →')}</span>
                                  </button>
                                </div>
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
                                <div className="flex flex-col gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSend(isEn ? `Book ${widget.title} now` : `Pesan layanan ${widget.title} sekarang`);
                                    }}
                                    className="min-h-10 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover shadow-sm"
                                  >
                                    <span>{isEn ? 'Book Directly in Chat' : 'Pesan Layanan di Sini'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate(widget.ctaPath || '/service');
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-1 py-1 text-[11px] font-semibold text-ink-muted hover:text-brand"
                                  >
                                    <span>{widget.ctaText || (isEn ? 'View Service Details →' : 'Lihat Detail Layanan →')}</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Widget Type: Ride */}
                            {widget.type === 'ride' && (
                              <div className="flex flex-col gap-2">
                                <div>
                                  <h4 className="text-[13px] font-extrabold text-ink">{widget.title}</h4>
                                  <p className="text-[11px] text-ink-muted">{widget.subtitle}</p>
                                </div>
                                <div className="flex flex-col gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSend(isEn ? 'Book ride now' : 'Pesan ojek motor sekarang');
                                    }}
                                    className="min-h-10 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-hover shadow-sm"
                                  >
                                    <span>{isEn ? 'Book Ride Directly in Chat' : 'Pesan Ojek Langsung di Sini'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate('/ride');
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-1 py-1 text-[11px] font-semibold text-ink-muted hover:text-brand"
                                  >
                                    <span>{widget.ctaText || (isEn ? 'Open Ride Map →' : 'Buka Peta Ride →')}</span>
                                  </button>
                                </div>
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
              primeSpeechSynthesis();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isListening
                    ? (isEn ? 'Listening... Speak now' : 'Mendengarkan... Silakan bicara')
                    : (isEn ? 'Ask or instruct: "Book ride to Kuta", "Clean pool"...' : 'Ketik pertanyaan atau perintah pemesanan...')
                }
                disabled={isLoading}
                className={`w-full min-h-11 rounded-control border bg-ground px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none transition disabled:opacity-50 ${
                  isListening
                    ? 'border-danger ring-2 ring-danger/20'
                    : 'border-line focus:border-brand'
                }`}
              />
              {isListening && (
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex h-2 w-2"
                  aria-hidden="true"
                >
                  <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={toggleListening}
              disabled={isLoading}
              title={
                isListening
                  ? (isEn ? 'Stop listening' : 'Berhenti mendengarkan')
                  : (isEn ? 'Voice command / Speak' : 'Perintah suara / Bicara')
              }
              aria-label={
                isListening
                  ? (isEn ? 'Stop listening' : 'Perintah suara')
                  : (isEn ? 'Voice command' : 'Perintah suara')
              }
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border transition shrink-0 disabled:opacity-50 ${
                isListening
                  ? 'border-danger bg-danger text-white animate-pulse shadow-sm'
                  : 'border-line bg-card text-ink-muted hover:bg-sunken hover:text-ink'
              }`}
            >
              <Mic size={17} />
            </button>

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control bg-brand px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-50 shrink-0"
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
