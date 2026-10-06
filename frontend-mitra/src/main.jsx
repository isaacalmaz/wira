import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';
import { startNativeShell } from './native/nativeShell';
import { checkAppUpdates } from './native/appUpdates';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// =========================================
// 📌 Entry Point Dashboard Mitra Wira
// Untuk driver, merchant, dan teknisi
// =========================================

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Register Service Worker for PWA. This owns the '/' scope for the app's own
// offline-caching behavior. The FCM worker (firebase-messaging-sw.js) is
// registered separately, in its own scope, by requestForToken() in
// src/config/firebase.js - keeping the two from contending over '/'.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      },
      (err) => {
        console.log('ServiceWorker registration failed: ', err);
      }
    );
  });
}

// Android app: status bar, splash, back button (no-op in the browser).
startNativeShell({ color: '#B7862A' });
checkAppUpdates({ app: 'mitra', origin: 'https://mitra.wira.one', color: '#B7862A', appName: 'Wira Mitra' });

// The Android app (wira.one/install) is the only install option: no
// "Install app" prompt from Chrome (manifest display is also "browser").
window.addEventListener('beforeinstallprompt', (e) => e.preventDefault());
