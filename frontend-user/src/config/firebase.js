import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAgX_LaIszGizE10NPivNZOyxU5Lb01VJU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "wira-455d1.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "wira-455d1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "wira-455d1.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "975569594019",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:975569594019:web:3c789ddb3d0fd43adb4116",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-ES59FLZEZY"
};

const app = initializeApp(firebaseConfig);

let messaging = null;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase Messaging Error", error);
  }
}

export const requestForToken = async () => {
  if (!messaging) return null;
  try {
    const currentToken = await getToken(messaging, { 
      // Replace with your VAPID key later if you want web push on standard browsers
      // vapidKey: "YOUR_VAPID_KEY"
    });
    if (currentToken) {
      console.log('Current token for client: ', currentToken);
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (messaging) {
      onMessage(messaging, (payload) => {
        resolve(payload);
      });
    }
  });

export { messaging };
