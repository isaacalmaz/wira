/**
 * speechUtils.js
 * Helpers for Web Speech API: Text-to-Speech (TTS) and Speech-to-Text (STT).
 */

let cachedVoices = [];

if (typeof window !== 'undefined' && window.speechSynthesis) {
  try {
    cachedVoices = window.speechSynthesis.getVoices() || [];
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        try {
          cachedVoices = window.speechSynthesis.getVoices() || [];
        } catch { /* ignore */ }
      };
    }
  } catch { /* ignore */ }
}

// Active utterance reference to prevent Chrome/Safari garbage-collection bug mid-speech
let activeUtterance = null;

/**
 * Strips markdown, URLs, symbols, and formatting from text to produce
 * a natural, clean spoken narration for SpeechSynthesis.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanTextForSpeech(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove fenced code blocks ```...```
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

  // 2. Remove inline code snippets `...` -> keep text inside
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 3. Convert Markdown links [Title](url) -> Title
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 4. Remove raw URLs (http / https)
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');

  // 5. Remove HTML tags if present (<br>, <div>, etc.)
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // 6. Remove Markdown headers (e.g. #, ##, ###)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 7. Remove bold, italic, and strikethrough markdown markers (***, **, *, ___, __, _, ~~)
  cleaned = cleaned.replace(/(\*\*\*|___)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

  // 8. Convert inline bullets / dashes between phrases to comma or pause
  cleaned = cleaned.replace(/[\u2022\u2023\u25E6\u2043\u2219•–—]/g, ', ');

  // 9. Remove list bullets and numbered items at line starts
  cleaned = cleaned.replace(/^[\s*+\-•–—]+\s+/gm, '');
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');

  // 10. Remove blockquotes (> quote)
  cleaned = cleaned.replace(/^>\s+/gm, '');

  // 11. Remove remaining brackets, hashes, lone asterisks, table pipes, tildes
  cleaned = cleaned.replace(/[[\]{}#*^~|]/g, '');

  // 12. Remove emojis and extended pictographic symbols
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, '');

  // 13. Normalize newlines to sentence pauses
  cleaned = cleaned.replace(/[\r\n]+/g, '. ');

  // 14. Clean punctuation sequences (e.g. duplicate periods or comma-periods)
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, '$1');
  cleaned = cleaned.replace(/,(\s*,)+/g, ',');
  cleaned = cleaned.replace(/,\./g, '.');
  cleaned = cleaned.replace(/\.,/g, '.');
  cleaned = cleaned.replace(/\.+/g, '.');

  // 15. Collapse multiple whitespaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 16. Ensure ending punctuation for natural speech cadence
  if (cleaned && !/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * Normalizes language strings to 'id' or 'en'
 * @param {string} lang
 * @returns {'id'|'en'}
 */
export function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') return 'id';
  const l = lang.toLowerCase().trim();
  if (l.startsWith('en')) return 'en';
  return 'id';
}

/**
 * Find the best available voice from SpeechSynthesis voices list
 * for the given language.
 * Supports standard codes ('en', 'en-US', 'en-GB', 'id', 'id-ID')
 * as well as legacy Android codes ('in', 'in-ID').
 *
 * @param {SpeechSynthesisVoice[]} voices
 * @param {string} lang
 * @returns {SpeechSynthesisVoice|null}
 */
export function getBestVoice(voices, lang) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const targetLang = normalizeLanguage(lang);

  if (targetLang === 'en') {
    // 1. Natural / Google / Siri / Premium en-US or en-GB voice
    const naturalEn = voices.find(
      (v) =>
        Boolean(v.lang && /^en([-_]|$)/i.test(v.lang)) &&
        /natural|google|siri|premium|enhanced/i.test(v.name || '')
    );
    if (naturalEn) return naturalEn;

    // 2. Exact match en-US
    const exactUs = voices.find((v) => Boolean(v.lang && /^en[-_]US$/i.test(v.lang)));
    if (exactUs) return exactUs;

    // 3. Fallback to any English voice
    return (
      voices.find(
        (v) =>
          Boolean(v.lang && /^en([-_]|$)/i.test(v.lang)) ||
          /english/i.test(v.name || '')
      ) || null
    );
  }

  // Indonesian (id / in / ind)
  const isIndoVoice = (v) =>
    Boolean(v.lang && /^(id|in|ind)([-_]|$)/i.test(v.lang)) ||
    /indonesia/i.test(v.name || '');

  // 1. Natural / Google / Damayanti / Gadis / Ardi / Premium voice
  const naturalId = voices.find(
    (v) =>
      isIndoVoice(v) &&
      /natural|google|damayanti|gadis|ardi|premium|enhanced/i.test(v.name || '')
  );
  if (naturalId) return naturalId;

  // 2. Any Indonesian voice
  const anyId = voices.find(isIndoVoice);
  if (anyId) return anyId;

  return null;
}

/**
 * Checks if Web Speech API SpeechRecognition is available.
 * @returns {typeof window.SpeechRecognition|null}
 */
export function getSpeechRecognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Checks if SpeechSynthesis is supported.
 * @returns {boolean}
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

/**
 * Primes the audio context for mobile browsers (iOS Safari)
 * within a user-gesture handler (e.g. click).
 */
export function primeSpeechSynthesis() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    const silent = new window.SpeechSynthesisUtterance('');
    silent.volume = 0;
    silent.text = '';
    window.speechSynthesis.speak(silent);
  } catch { /* ignore */ }
}

/**
 * Cancels any currently playing speech.
 */
export function cancelSpeech() {
  activeUtterance = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch { /* ignore */ }
  }
}

/**
 * Speaks text using SpeechSynthesis.
 *
 * @param {string} text
 * @param {object} options
 * @param {string} [options.lang]
 * @param {boolean} [options.isEn]
 * @param {number} [options.rate]
 * @param {number} [options.pitch]
 * @param {number} [options.volume]
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onEnd]
 * @param {(err: any) => void} [options.onError]
 * @returns {SpeechSynthesisUtterance|null}
 */
export function speakText(
  text,
  {
    lang = 'id-ID',
    isEn = false,
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    onStart,
    onEnd,
    onError,
  } = {}
) {
  if (!isSpeechSynthesisSupported()) return null;

  cancelSpeech();

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return null;

  const utterance = new window.SpeechSynthesisUtterance(cleaned);
  const targetIsEn = isEn || normalizeLanguage(lang) === 'en';
  utterance.lang = targetIsEn ? 'en-US' : 'id-ID';
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = volume;

  // Use cached voices if available, or fetch fresh
  const voices =
    (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices?.()) || [];
  const voice = getBestVoice(voices, targetIsEn ? 'en' : 'id');
  if (voice) {
    utterance.voice = voice;
  }

  // Prevent Garbage Collection in Chromium/Safari by retaining activeUtterance
  activeUtterance = utterance;

  utterance.onstart = (evt) => {
    if (onStart) onStart(evt);
  };

  utterance.onend = (evt) => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    if (onEnd) onEnd(evt);
  };

  utterance.onerror = (evt) => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    if (onError) onError(evt);
  };

  try {
    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch (err) {
    activeUtterance = null;
    if (onError) onError(err);
    return null;
  }
}
