// Android app shell (Capacitor). Does nothing in a browser.
//  - status bar in the app's colour, splash hidden once the UI is up
//  - the Android back button goes back a page, and only leaves the app
//    (minimises it) from the first page
//  - native push: the WebView cannot receive web push, so the app asks
//    Firebase for a device token and stores it as users.fcm_token. Needs
//    android/app/google-services.json (Firebase console), which every APK
//    since 1.0 ships; set VITE_NATIVE_PUSH=0 to build without it. On by
//    default because live-update bundles are built on Vercel (no flag).
import { Capacitor } from '@capacitor/core';

export async function startNativeShell({ color, darkIcons = false }) {
  if (!Capacitor.isNativePlatform()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
    import('@capacitor/status-bar'), import('@capacitor/splash-screen'), import('@capacitor/app'),
  ]);
  try {
    await StatusBar.setBackgroundColor({ color });
    await StatusBar.setStyle({ style: darkIcons ? Style.Light : Style.Dark });
  } catch { /* older Android */ }
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname.split('/').filter(Boolean).length > 1) window.history.back();
    else App.minimizeApp();
  });
  setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
}

let regListener = null;
let regErrListener = null;
let actionListener = null;
let recvListener = null;

/** Registers for native push and calls onToken(token). */
export async function registerNativePush(onToken, onNotificationReceived) {
  if (!Capacitor.isNativePlatform() || import.meta.env.VITE_NATIVE_PUSH === '0') return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  // Remove existing listeners to avoid duplicate callbacks on re-registration
  if (regListener?.remove) {
    try { await regListener.remove(); } catch (err) { void err; }
    regListener = null;
  }
  if (regErrListener?.remove) {
    try { await regErrListener.remove(); } catch (err) { void err; }
    regErrListener = null;
  }
  if (actionListener?.remove) {
    try { await actionListener.remove(); } catch (err) { void err; }
    actionListener = null;
  }
  if (recvListener?.remove) {
    try { await recvListener.remove(); } catch (err) { void err; }
    recvListener = null;
  }

  // onToken returns a Supabase query, which only runs when awaited: the
  // un-awaited call here saved no Android token at all from 2026-10-02 to
  // 2026-10-13 (so no app user got a push). Await it and log failures.
  regListener = await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      const res = await onToken(value);
      if (res?.error) console.error('Saving push token failed:', res.error.message);
    } catch (err) {
      console.error('Saving push token failed:', err);
    }
  });
  regErrListener = await PushNotifications.addListener('registrationError', (err) => console.error('Push registration failed:', err?.error || err));
  actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    // Role-less or customer links are resolved by the router's aliases
    // (App.jsx); anything unknown lands on the portal home.
    const url = notification?.data?.url;
    if (url && url.startsWith('/')) window.location.assign(url);
  });
  if (typeof onNotificationReceived === 'function') {
    recvListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      onNotificationReceived(notification);
    });
  }
  await PushNotifications.register();
}

export const isNative = () => Capacitor.isNativePlatform();
