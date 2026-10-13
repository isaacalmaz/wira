// firebase-admin@14.x (see package.json's ^14.4.0) dropped the old
// `require('firebase-admin')` default-namespace compat surface
// (admin.apps / admin.credential.cert / admin.messaging()) in favor of
// modular sub-package imports. The previous version of this file used that
// old API: `admin.apps` was `undefined` here, so `admin.apps.length` threw a
// TypeError synchronously at require()-time - which meant anything that
// required this module (transitively: any route requiring
// notificationService.js, which requires this file) crashed the entire
// Express app at startup, not just the notification feature. Empirically
// confirmed by running `node server.js` directly before this fix.
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// FIREBASE_PRIVATE_KEY is pasted by hand into Vercel, and the 2026-10-13
// key rotation failed with "Failed to parse private key". Accept every shape
// a paste can take: the bare PEM, the JSON-escaped value with literal \n,
// the value still wrapped in its JSON quotes, or the whole service-account
// JSON file (then its client_email/project_id are used too).
const readServiceAccount = () => {
  let raw = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  let fromJson = {};
  if (raw.startsWith('{')) {
    try {
      fromJson = JSON.parse(raw);
      raw = fromJson.private_key || '';
    } catch (err) {
      console.error('FIREBASE_PRIVATE_KEY looks like JSON but does not parse:', err.message);
    }
  }
  raw = raw.replace(/^"private_key"\s*:\s*/, '').replace(/,$/, '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  const privateKey = raw.replace(/\\n/g, '\n').replace(/\r/g, '');
  return {
    projectId: fromJson.project_id || process.env.FIREBASE_PROJECT_ID,
    clientEmail: fromJson.client_email || (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
    privateKey,
  };
};

if (!getApps().length) {
  try {
    const account = readServiceAccount();
    initializeApp({ credential: cert(account) });
    // Shape only, never the key itself: tells a bad paste from a bad key.
    console.log('Firebase Admin initialized successfully', {
      projectId: account.projectId,
      clientEmail: account.clientEmail,
      keyLines: account.privateKey.split('\n').length,
    });
  } catch (error) {
    const key = readServiceAccount().privateKey;
    console.error('Firebase Admin initialization error', error.message, {
      hasBegin: key.includes('-----BEGIN PRIVATE KEY-----'),
      hasEnd: key.includes('-----END PRIVATE KEY-----'),
      length: key.length,
    });
  }
}

// Re-exported with the same `.messaging()` shape the old default `admin`
// export had, so notificationService.js's `admin.messaging().send(...)`
// call keeps working unchanged.
module.exports = {
  messaging: getMessaging,
};
