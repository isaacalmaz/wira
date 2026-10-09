// Packs the built app (dist/) into dist/live/<version>.zip plus
// dist/live/manifest.json, so the Android app can update its screens
// without a new APK (@capgo/capacitor-updater in manual mode, see
// src/native/liveUpdate.js). Runs after `vite build`; no dependencies.
//
// package.json "liveUpdate.minNativeBuild": the lowest APK versionCode this
// bundle works on. Raise it whenever a release adds a native plugin or
// permission; older APKs then keep their current screens and are asked to
// install the new APK instead (app_releases, migrations/0105).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const minNativeBuild = pkg.liveUpdate?.minNativeBuild ?? 1;
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const version = sha ? `${stamp}-${sha}` : stamp;

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(dist, full).split('\\').join('/');
    if (rel === 'live' || rel.endsWith('.map')) continue;
    if (statSync(full).isDirectory()) walk(full);
    else files.push(rel);
  }
};
walk(dist);

const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(join(dist, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(8, 8); head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
  locals.push(head, nameBuf, packed);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10); cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(offset, 42);
  centrals.push(cen, nameBuf);
  offset += head.length + nameBuf.length + packed.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, central, end]);

const out = join(dist, 'live');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${version}.zip`), zip);
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  version, url: `/live/${version}.zip`, minNativeBuild, files: files.length, bytes: zip.length, builtAt: new Date().toISOString(),
  // @capgo/capacitor-updater 6.x refuses a download without the zip's SHA-256.
  checksum: createHash('sha256').update(zip).digest('hex'),
}, null, 2));
console.log(`live bundle ${version}: ${files.length} files, ${(zip.length / 1048576).toFixed(1)} MB`);
