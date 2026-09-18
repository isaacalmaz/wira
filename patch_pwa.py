import re

# Patch index.html
with open('frontend-user/index.html', 'r') as f:
    html = f.read()

head_additions = """
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#2563eb" />
    <link rel="apple-touch-icon" href="/icons/icon.svg" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
"""
if "manifest.json" not in html:
    html = html.replace('</title>', '</title>\n' + head_additions)
    with open('frontend-user/index.html', 'w') as f:
        f.write(html)

# Patch main.jsx to register SW
with open('frontend-user/src/main.jsx', 'r') as f:
    main_js = f.read()

sw_registration = """
// Register Service Worker for PWA
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
"""
if "serviceWorker" not in main_js:
    main_js = main_js + "\n" + sw_registration
    with open('frontend-user/src/main.jsx', 'w') as f:
        f.write(main_js)

