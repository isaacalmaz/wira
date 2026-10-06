// =========================================
// Google Play store graphics for Wira and Wira Mitra.
//
// Writes branding/play/out/<app>/:
//   icon-512.png          app icon (full-bleed square; Play rounds it)
//   feature-1024x500.png  feature graphic
//   screenshot-N.png      1080x1920 framed screenshots, made from raw phone
//                         screenshots in branding/play/raw/<app>/N.png (optional)
//
// Text is rendered by headless Google Chrome with the app's own font.
// Run from the repo root (sharp is not a project dependency on purpose):
//   SHARP_FROM=<folder with node_modules/sharp> node branding/play/generate-play-assets.mjs
// =========================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const require = createRequire(process.env.SHARP_FROM ? path.join(process.env.SHARP_FROM, 'noop.js') : import.meta.url);
const sharp = require('sharp');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT = pathToFileURL(path.join(ROOT, 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')).href;

// Same geometry and colours as branding/generate-icons.mjs.
const WAVE = 'M16 38 C26 38 28.5 70 36.5 70 C44 70 44.5 47 50 47 C55.5 47 56 70 63.5 70 C71.5 70 74 38 84 38';
const mark = (c, { tile = true, rx = 0 } = {}) =>
  (tile ? `<rect width="100" height="100" rx="${rx}" fill="${c.tile}"/>` : '')
  + `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${WAVE}" stroke="${c.wave}" stroke-width="10.5"/>`
  + `<circle cx="78" cy="20" r="7" fill="${c.sun}" stroke="none"/></g>`;

const APPS = {
  user: {
    tile: '#0B4F5E', wave: '#F7F6F3', sun: '#D9A845', ink: '#F7F6F3', soft: 'rgba(247,246,243,.72)', deep: '#083C48',
    name: 'Wira',
    headline: 'Semua kebutuhan harian di Lombok, satu aplikasi.',
    chips: ['Ojek & mobil', 'Makanan', 'Kirim barang', 'Villa', 'Teknisi'],
    captions: [
      ['Pesan ojek & mobil', 'Harga jelas sebelum berangkat'],
      ['Makanan favorit diantar', 'Dari warung dan resto sekitar Anda'],
      ['Villa untuk liburan', 'Cek tanggal kosong, langsung pesan'],
      ['Teknisi terpercaya', 'Servis AC, listrik, kolam renang'],
      ['Pantau pesanan', 'Lacak mitra secara langsung'],
    ],
  },
  mitra: {
    tile: '#B7862A', wave: '#062F3C', sun: '#F7F6F3', ink: '#062F3C', soft: 'rgba(6,47,60,.74)', deep: '#9C7020',
    name: 'Wira Mitra',
    headline: 'Terima pesanan, atur penghasilan Anda sendiri.',
    chips: ['Pengemudi', 'Merchant', 'Pemilik villa', 'Teknisi'],
    captions: [
      ['Pesanan & riwayat rapi', 'Setiap order selesai tercatat jelas'],
      ['Akun mitra terverifikasi', 'Kelola profil dan pengaturan dengan mudah'],
      ['Kelola menu & villa', 'Atur harga, foto, dan ketersediaan'],
      ['Navigasi ke pelanggan', 'Rute dan chat dalam satu layar'],
      ['Gabung jadi mitra', 'Daftar cukup dengan KTP'],
    ],
  },
};

const fontFace = `@font-face{font-family:Jakarta;src:url("${FONT}") format("woff2");font-weight:200 800}`;

function shoot(html, w, h, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wira-play-'));
  const file = path.join(tmp, 'page.html');
  fs.writeFileSync(file, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, `--screenshot=${out}`, '--virtual-time-budget=3000', pathToFileURL(file).href], { stdio: 'ignore' });
  fs.rmSync(tmp, { recursive: true, force: true });
}

function featureHtml(c) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFace}
  *{margin:0;box-sizing:border-box} html,body{width:1024px;height:500px;overflow:hidden}
  body{background:${c.tile};font-family:Jakarta,sans-serif;color:${c.ink};position:relative}
  .glow{position:absolute;right:-120px;top:-160px;width:640px;height:640px;border-radius:50%;
    background:radial-gradient(circle, ${c.sun}33 0%, transparent 62%)}
  .mark{position:absolute;right:56px;top:50%;transform:translateY(-50%);width:330px;height:330px}
  .copy{position:absolute;left:72px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:22px}
  .brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:30px;letter-spacing:-.01em}
  .brand svg{width:52px;height:52px;border-radius:13px;box-shadow:0 0 0 2px ${c.ink}22}
  h1{font-size:46px;line-height:1.1;font-weight:800;letter-spacing:-.025em;text-wrap:balance}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chips span{font-size:17px;font-weight:600;padding:7px 14px;border-radius:999px;background:${c.ink}1a;color:${c.ink}}
  </style></head><body><div class="glow"></div>
  <svg class="mark" viewBox="0 0 100 100">${mark(c, { tile: false })}</svg>
  <div class="copy"><div class="brand"><svg viewBox="0 0 100 100">${mark({ ...c, tile: c.deep }, { rx: 22 })}</svg>${c.name}</div>
  <h1>${c.headline}</h1><div class="chips">${c.chips.map((t) => `<span>${t}</span>`).join('')}</div></div></body></html>`;
}

function screenshotHtml(c, [title, sub], shotUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFace}
  *{margin:0;box-sizing:border-box} html,body{width:1080px;height:1920px;overflow:hidden}
  body{background:${c.tile};font-family:Jakarta,sans-serif;color:${c.ink};display:flex;flex-direction:column;align-items:center}
  header{padding:120px 90px 0;text-align:center;display:flex;flex-direction:column;gap:22px}
  h1{font-size:76px;line-height:1.08;font-weight:800;letter-spacing:-.03em;text-wrap:balance}
  p{font-size:38px;font-weight:500;color:${c.soft};text-wrap:balance}
  .phone{margin-top:90px;width:780px;flex:1;border-radius:72px 72px 0 0;background:#111;padding:22px 22px 0;
    box-shadow:0 40px 90px rgba(0,0,0,.28)}
  .phone div{width:100%;height:100%;border-radius:52px 52px 0 0;background:url("${shotUrl}") top center/cover no-repeat #fff}
  </style></head><body><header><h1>${title}</h1><p>${sub}</p></header><div class="phone"><div></div></div></body></html>`;
}

for (const [key, c] of Object.entries(APPS)) {
  const out = path.join(here, 'out', key);
  fs.mkdirSync(out, { recursive: true });

  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">${mark(c)}</svg>`))
    .png().toFile(path.join(out, 'icon-512.png'));

  shoot(featureHtml(c), 1024, 500, path.join(out, 'feature-1024x500.png'));

  const rawDir = path.join(here, 'raw', key);
  const raws = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort() : [];
  raws.forEach((f, i) => {
    const caption = c.captions[i] || c.captions[c.captions.length - 1];
    shoot(screenshotHtml(c, caption, pathToFileURL(path.join(rawDir, f)).href), 1080, 1920, path.join(out, `screenshot-${i + 1}.png`));
  });

  // Chrome screenshots carry an alpha channel; Play wants opaque PNGs.
  for (const f of fs.readdirSync(out).filter((n) => n.endsWith('.png'))) {
    const p = path.join(out, f);
    const buf = await sharp(p).flatten({ background: c.tile }).removeAlpha().png().toBuffer();
    fs.writeFileSync(p, buf);
  }
  console.log(`${key}: icon, feature graphic, ${raws.length} screenshot(s)`);
}
