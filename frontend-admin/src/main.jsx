import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css'
import { startNativeShell } from './native/nativeShell'
import { checkAppUpdates } from './native/appUpdates'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

// Register Service Worker for offline-caching resilience only. This app has
// no manifest.json / install prompts by design - see public/sw.js for why.
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
startNativeShell({ color: '#21201D' })
checkAppUpdates({ app: 'admin', origin: 'https://admin.wira.one', color: '#21201D', appName: 'Wira Admin' })
