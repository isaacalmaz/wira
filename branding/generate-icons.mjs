// =========================================
// Wira logo: single source of truth for every icon we ship.
//
// Writes, for each app (user / mitra / admin):
//   public/icons/      favicon.svg, favicon-16/32.png, icon.svg, icon-180.png
//                      (apple-touch), icon-192/512.png, maskable-192/512.png,
//                      badge-96.png (web push badge, one colour)
//   android res/       mipmap-*/ic_launcher{,_round,_foreground,_monochrome}.png,
//                      drawable-*/ic_stat_wira.png (notification icon),
//                      drawable*/splash.png, values/ic_launcher_background.xml
//
// Geometry is on a 100-unit grid and matches the approved design canvas
// (arah G, "Senja di samping").
//
// Run from the repo root (sharp is not a project dependency on purpose):
//   npm i --no-save sharp && node branding/generate-icons.mjs
// or point SHARP_FROM at any folder whose node_modules has sharp.
// =========================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const require = createRequire(process.env.SHARP_FROM ? path.join(process.env.SHARP_FROM, 'noop.js') : import.meta.url);
const sharp = require('sharp');

export const APPS = {
  user:  { dir: 'frontend-user',  tile: '#0B4F5E', wave: '#F7F6F3', sun: '#D9A845' },
  mitra: { dir: 'frontend-mitra', tile: '#B7862A', wave: '#062F3C', sun: '#F7F6F3' },
  admin: { dir: 'frontend-admin', tile: '#21201D', wave: '#F7F6F3', sun: '#3FA3B5' },
};

// "Senja di samping": the W is a wave, the dot is the sun setting at the
// top right (Senggigi at dusk). Same geometry at every size; below 32 px
// only the stroke gets heavier so the wave does not thin out.
const WAVE = 'M16 38 C26 38 28.5 70 36.5 70 C44 70 44.5 47 50 47 C55.5 47 56 70 63.5 70 C71.5 70 74 38 84 38';
const SUN = { cx: 78, cy: 20, r: 7 };

/**
 * One mark on a 100x100 viewBox.
 * tile: 'rounded' | 'square' (full bleed) | 'circle' | 'none'
 * scale: mark size relative to the tile (1 = as designed)
 * mono: a colour string draws everything in that one colour
 */
function markInner(c, { simple = false, tile = 'rounded', scale = 1, mono = null } = {}) {
  const wave = mono || c.wave;
  const sun = mono || c.sun;
  const rx = tile === 'rounded' ? 22 : tile === 'circle' ? 50 : 0;
  const bg = tile === 'none' ? '' : `<rect width="100" height="100" rx="${rx}" fill="${c.tile}"/>`;
  const t = scale === 1 ? '' : ` transform="translate(50 50) scale(${scale}) translate(-50 -50)"`;
  const strokes = `<path d="${WAVE}" stroke="${wave}" stroke-width="${simple ? 12 : 10.5}"/>`
    + `<circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="${sun}" stroke="none"/>`;
  return `${bg}<g${t} fill="none" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`;
}

export function markSvg(c, size, opts = {}) {
  const simple = opts.simple ?? size <= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${markInner(c, { ...opts, simple })}</svg>`;
}

function splashSvg(c, w, h) {
  const s = Math.round(Math.min(w, h) * 0.3);
  const x = Math.round((w - s) / 2);
  const y = Math.round((h - s) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${c.tile}"/>`
    + `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 100 100">${markInner(c, { tile: 'none' })}</svg></svg>`;
}

async function png(svg, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = {
  'drawable': [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};

for (const [key, c] of Object.entries(APPS)) {
  const pub = path.join(ROOT, c.dir, 'public', 'icons');
  const res = path.join(ROOT, c.dir, 'android', 'app', 'src', 'main', 'res');
  fs.mkdirSync(pub, { recursive: true });

  // ---------- web ----------
  fs.writeFileSync(path.join(pub, 'favicon.svg'), markSvg(c, 32) + '\n');
  fs.writeFileSync(path.join(pub, 'icon.svg'), markSvg(c, 512) + '\n');
  await png(markSvg(c, 16), path.join(pub, 'favicon-16.png'));
  await png(markSvg(c, 32), path.join(pub, 'favicon-32.png'));
  await png(markSvg(c, 180, { tile: 'square' }), path.join(pub, 'icon-180.png')); // iOS masks the corners itself
  await png(markSvg(c, 192), path.join(pub, 'icon-192.png'));
  await png(markSvg(c, 512), path.join(pub, 'icon-512.png'));
  await png(markSvg(c, 192, { tile: 'square', scale: 0.8 }), path.join(pub, 'maskable-192.png'));
  await png(markSvg(c, 512, { tile: 'square', scale: 0.8 }), path.join(pub, 'maskable-512.png'));
  await png(markSvg(c, 96, { tile: 'none', simple: true, scale: 1.2, mono: '#FFFFFF' }), path.join(pub, 'badge-96.png'));

  // ---------- android ----------
  if (fs.existsSync(res)) {
    for (const [d, f] of Object.entries(DENSITIES)) {
      const mip = path.join(res, `mipmap-${d}`);
      const legacy = Math.round(48 * f);
      const adaptive = Math.round(108 * f);
      await png(markSvg(c, legacy, { simple: false }), path.join(mip, 'ic_launcher.png'));
      await png(markSvg(c, legacy, { simple: false, tile: 'circle', scale: 0.84 }), path.join(mip, 'ic_launcher_round.png'));
      // Adaptive layers: 108dp canvas, launchers may crop to a 66dp circle,
      // so the mark is sized to keep the corner sun inside it.
      await png(markSvg(c, adaptive, { simple: false, tile: 'none', scale: 0.62 }), path.join(mip, 'ic_launcher_foreground.png'));
      await png(markSvg(c, adaptive, { simple: false, tile: 'none', scale: 0.62, mono: '#FFFFFF' }), path.join(mip, 'ic_launcher_monochrome.png'));
      // Status-bar notification icon: 24dp, white on transparent, no detail.
      await png(markSvg(c, Math.round(24 * f), { tile: 'none', simple: true, scale: 1.2, mono: '#FFFFFF' }),
        path.join(res, `drawable-${d}`, 'ic_stat_wira.png'));
    }
    for (const [folder, [w, h]] of Object.entries(SPLASH)) {
      await png(splashSvg(c, w, h), path.join(res, folder, 'splash.png'));
    }
    fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${c.tile}</color>\n</resources>\n`);
  }
  console.log(`${key}: done`);
}
