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

// Parse the private key properly to handle newline characters from env vars
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error', error.stack);
  }
}

// Re-exported with the same `.messaging()` shape the old default `admin`
// export had, so notificationService.js's `admin.messaging().send(...)`
// call keeps working unchanged.
module.exports = {
  messaging: getMessaging,
};
