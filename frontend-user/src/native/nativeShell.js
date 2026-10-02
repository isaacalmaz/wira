// Android app shell (Capacitor). Does nothing in a browser.
//  - status bar in the app's colour, splash hidden once the UI is up
//  - the Android back button goes back a page, and only leaves the app
//    (minimises it) from the first page
//  - native push: the WebView cannot receive web push, so the app asks
//    Firebase for a device token and stores it as users.fcm_token. Only
//    enabled when the build has VITE_NATIVE_PUSH=1, because it needs
//    android/app/google-services.json (Firebase console) or the app crashes.
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

/** Registers for native push and calls onToken(token). */
export async function registerNativePush(onToken) {
  if (!Capacitor.isNativePlatform() || import.meta.env.VITE_NATIVE_PUSH !== '1') return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  PushNotifications.addListener('registration', ({ value }) => onToken(value));
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = notification?.data?.url;
    if (url) window.location.assign(url);
  });
  await PushNotifications.register();
}

export const isNative = () => Capacitor.isNativePlatform();
