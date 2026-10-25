#!/usr/bin/env node

/**
 * Test Suite: Wira AI Assistant Voice Integration (STT & TTS)
 * Tests speech text cleaning, voice resolution, and speech utilities.
 */

import assert from 'assert';
import {
  cleanTextForSpeech,
  getBestVoice,
  getSpeechRecognitionClass,
  isSpeechSynthesisSupported,
  normalizeLanguage,
  primeSpeechSynthesis,
} from '../frontend-user/src/components/assistant/speechUtils.js';

console.log('============================================================');
console.log('🎙️ RUNNING WIRA AI VOICE INTEGRATION TESTS');
console.log('============================================================\n');

let passCount = 0;
let totalCount = 0;

function runTest(title, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title}`);
    console.error(err);
  }
}

// 1. Text Cleaning for Spoken Narration
console.log('--- [Feature: Text Cleaning for Spoken Narration] ---');

runTest('cleanTextForSpeech removes bold and italic markdown', () => {
  const input = '**Halo kawan!** Ini adalah *pesanan* Anda.';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Halo kawan! Ini adalah pesanan Anda.');
});

runTest('cleanTextForSpeech converts markdown links to pure anchor text', () => {
  const input = 'Silakan cek [Menu WiraFood](https://wira.id/food/ayam-taliwang) kami.';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Silakan cek Menu WiraFood kami.');
});

runTest('cleanTextForSpeech strips raw HTTP/HTTPS URLs', () => {
  const input = 'Kunjungi website https://wira.id untuk info lebih lanjut.';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Kunjungi website untuk info lebih lanjut.');
});

runTest('cleanTextForSpeech strips code blocks and inline code', () => {
  const input = 'Berikut kodenya ```const x = 10;``` dan kode inline `Rp 50.000` siap.';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Berikut kodenya dan kode inline Rp 50.000 siap.');
});

runTest('cleanTextForSpeech strips list item markers and headers', () => {
  const input = '### Layanan Tersedia:\n* Ojek Motor\n- Sewa Villa\n1. Kuras Kolam';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Layanan Tersedia:. Ojek Motor. Sewa Villa. Kuras Kolam.');
});

runTest('cleanTextForSpeech strips emojis and pictographs for natural narration', () => {
  const input = 'Halo semuanya! ✨🛵 Silakan pilih layanan terbaik ⭐👍.';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Halo semuanya! Silakan pilih layanan terbaik.');
});

runTest('cleanTextForSpeech handles null, undefined, or empty inputs gracefully', () => {
  assert.strictEqual(cleanTextForSpeech(''), '');
  assert.strictEqual(cleanTextForSpeech(null), '');
  assert.strictEqual(cleanTextForSpeech(undefined), '');
  assert.strictEqual(cleanTextForSpeech('   '), '');
});

runTest('cleanTextForSpeech adds ending period if missing', () => {
  const input = 'Pesanan ojek sedang diproses';
  const output = cleanTextForSpeech(input);
  assert.strictEqual(output, 'Pesanan ojek sedang diproses.');
});

runTest('cleanTextForSpeech strips leftover hashes, lone asterisks, brackets, and inline bullets', () => {
  const input = 'Pilihan #1: [Ayam Taliwang] • *Plecing* {Pedas}';
  const output = cleanTextForSpeech(input);
  // Hashes, brackets, asterisks stripped, inline bullet converted to comma
  assert.strictEqual(output, 'Pilihan 1: Ayam Taliwang, Plecing Pedas.');
});

// 2. Voice Selection Logic
console.log('\n--- [Feature: Voice Selection Logic] ---');

const mockVoices = [
  { name: 'Alex', lang: 'en-US' },
  { name: 'Google Bahasa Indonesia', lang: 'id-ID' },
  { name: 'Damayanti', lang: 'id_ID' },
  { name: 'Samantha (Natural)', lang: 'en-US' },
  { name: 'Google UK English Female', lang: 'en-GB' },
  { name: 'Android Legacy Indonesian', lang: 'in-ID' },
];

runTest('getBestVoice selects natural/Google Indonesian voice for id lang', () => {
  const voice = getBestVoice(mockVoices, 'id');
  assert.ok(voice, 'Expected an Indonesian voice');
  assert.strictEqual(voice.name, 'Google Bahasa Indonesia');
  assert.strictEqual(voice.lang, 'id-ID');
});

runTest('getBestVoice selects natural English voice for en lang', () => {
  const voice = getBestVoice(mockVoices, 'en');
  assert.ok(voice, 'Expected an English voice');
  assert.strictEqual(voice.name, 'Samantha (Natural)');
});

runTest('getBestVoice supports full BCP-47 language tags en-US and id-ID without cross-contamination', () => {
  const voiceEn = getBestVoice(mockVoices, 'en-US');
  assert.strictEqual(voiceEn.name, 'Samantha (Natural)');

  const voiceId = getBestVoice(mockVoices, 'id-ID');
  assert.strictEqual(voiceId.name, 'Google Bahasa Indonesia');
});

runTest('getBestVoice supports legacy Android in-ID language tag for Indonesian', () => {
  const legacyList = [{ name: 'Android Legacy Indonesian', lang: 'in-ID' }];
  const voice = getBestVoice(legacyList, 'id');
  assert.ok(voice);
  assert.strictEqual(voice.name, 'Android Legacy Indonesian');
});

runTest('getBestVoice falls back gracefully if voice list is empty', () => {
  assert.strictEqual(getBestVoice([], 'id'), null);
  assert.strictEqual(getBestVoice(null, 'id'), null);
});

// 3. Language Normalization
console.log('\n--- [Feature: Language Normalization] ---');

runTest('normalizeLanguage maps varied tags accurately', () => {
  assert.strictEqual(normalizeLanguage('en'), 'en');
  assert.strictEqual(normalizeLanguage('en-US'), 'en');
  assert.strictEqual(normalizeLanguage('en-GB'), 'en');
  assert.strictEqual(normalizeLanguage('id'), 'id');
  assert.strictEqual(normalizeLanguage('id-ID'), 'id');
  assert.strictEqual(normalizeLanguage('in-ID'), 'id');
  assert.strictEqual(normalizeLanguage(''), 'id');
});

// 4. Browser Feature Detection
console.log('\n--- [Feature: Browser API Environment Detection] ---');

runTest('getSpeechRecognitionClass returns null in non-browser Node environment', () => {
  assert.strictEqual(getSpeechRecognitionClass(), null);
});

runTest('isSpeechSynthesisSupported returns false in non-browser Node environment', () => {
  assert.strictEqual(isSpeechSynthesisSupported(), false);
});

runTest('primeSpeechSynthesis safely executes without throwing in non-browser Node environment', () => {
  assert.doesNotThrow(() => {
    primeSpeechSynthesis();
  });
});

console.log('\n============================================================');
console.log(`📊 RESULTS: ${passCount} / ${totalCount} tests passed`);
console.log('============================================================');

if (passCount !== totalCount) {
  process.exit(1);
}
