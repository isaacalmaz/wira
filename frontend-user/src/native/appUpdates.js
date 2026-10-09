// Keeping the Android app current. Does nothing in a browser.
//
// 1. Screens (live update): every web deploy also publishes
//    /live/manifest.json + a zip of the built app (scripts/live-bundle.mjs).
//    On launch the app downloads a newer zip in the background and switches
//    to it the next time it goes to the background, so new screens arrive
//    without installing an APK. A bundle that needs a newer APK
//    (minNativeBuild) is skipped. If a new bundle fails to start, the
//    updater rolls back (notifyAppReady below must run on every launch).
// 2. APK (app_releases, migrations/0105): when admins publish a newer build
//    than this one, the app shows "Versi baru tersedia"; a mandatory release
//    blocks the app until updated. Builds from Google Play (versionCode >= 3)
//    are sent to their Play Store page: Play policy forbids a Play app from
//    updating itself any other way. Older sideloaded APKs keep the
//    wira.one/install link.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '../config/supabase';

const DISMISS_KEY = 'wira_update_dismissed';
// First versionCode published on Google Play (1.2).
const FIRST_PLAY_BUILD = 3;

async function nativeBuild() {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return { build: Number(info.build) || 0, version: info.version, id: info.id };
}

async function liveUpdate(origin, build) {
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
  try { await CapacitorUpdater.notifyAppReady(); } catch { /* first launch */ }
  const res = await CapacitorHttp.get({ url: `${origin}/live/manifest.json?t=${Date.now()}` });
  const m = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  if (!m?.version || !m?.url || build < (m.minNativeBuild || 1)) return;
  const current = await CapacitorUpdater.current();
  if (current?.bundle?.version === m.version) return;
  const { bundles } = await CapacitorUpdater.list();
  const ready = (bundles || []).find((b) => b.version === m.version && b.status !== 'error');
  const bundle = ready || await CapacitorUpdater.download({ url: `${origin}${m.url}`, version: m.version });
  // next() alone only applies on a cold start; also switch as soon as the
  // app goes to the background, so the new screens are there on return.
  await CapacitorUpdater.next({ id: bundle.id });
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) return;
    sub.remove();
    try { await CapacitorUpdater.set({ id: bundle.id }); } catch { /* applies on next cold start */ }
  });
}

function showPrompt({ release, color, appName }) {
  if (document.getElementById('wira-update-prompt')) return;
  const wrap = document.createElement('div');
  wrap.id = 'wira-update-prompt';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,20,24,.55);padding:16px;font-family:inherit';
  const card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:420px;background:#fff;color:#21201D;border-radius:20px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:10px';
  const h = document.createElement('p');
  h.style.cssText = 'margin:0;font-size:17px;font-weight:800';
  h.textContent = release.mandatory ? `Perbarui ${appName} untuk melanjutkan` : `Versi baru ${appName} tersedia`;
  const v = document.createElement('p');
  v.style.cssText = 'margin:0;font-size:13px;color:#6B6862';
  v.textContent = `Versi ${release.version_name}`;
  card.append(h, v);
  if (release.notes) {
    const n = document.createElement('p');
    n.style.cssText = 'margin:0;font-size:14px;line-height:1.5;white-space:pre-line';
    n.textContent = release.notes;
    card.append(n);
  }
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = release.fromPlay ? 'Perbarui di Play Store' : 'Unduh versi baru';
  go.style.cssText = `min-height:48px;border:0;border-radius:12px;background:${color};color:#fff;font-size:15px;font-weight:700`;
  // Navigating to an external URL opens the system browser in Capacitor.
  go.onclick = () => { window.location.href = release.download_url; };
  card.append(go);
  if (!release.mandatory) {
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Nanti saja';
    later.style.cssText = 'min-height:44px;border:0;background:transparent;color:#6B6862;font-size:14px;font-weight:600';
    later.onclick = () => {
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ code: release.version_code, at: Date.now() })); } catch { /* ignore */ }
      wrap.remove();
    };
    card.append(later);
  }
  wrap.append(card);
  document.body.append(wrap);
}

async function apkUpdate({ app, build, appId, color, appName }) {
  const { data } = await supabase.from('app_releases').select('version_name, version_code, download_url, notes, mandatory')
    .eq('app', app).order('version_code', { ascending: false }).limit(1).maybeSingle();
  if (!data || data.version_code <= build) return;
  if (!data.mandatory) {
    try {
      const d = JSON.parse(localStorage.getItem(DISMISS_KEY) || 'null');
      // Asked again for a newer release, or after three days.
      if (d && d.code === data.version_code && Date.now() - d.at < 3 * 86400000) return;
    } catch { /* ignore */ }
  }
  const release = build >= FIRST_PLAY_BUILD && appId
    ? { ...data, fromPlay: true, download_url: `https://play.google.com/store/apps/details?id=${appId}` }
    : data;
  showPrompt({ release, color, appName });
}

/** app: 'user' | 'mitra' | 'admin'; origin: the site this app is served from. */
export async function checkAppUpdates({ app, origin, color, appName }) {
  if (!Capacitor.isNativePlatform()) return;
  let build = 0;
  let appId = null;
  try { ({ build, id: appId } = await nativeBuild()); } catch { /* ignore */ }
  liveUpdate(origin, build).catch((e) => console.warn('live update skipped:', e?.message || e));
  apkUpdate({ app, build, appId, color, appName }).catch((e) => console.warn('apk update check skipped:', e?.message || e));
}
