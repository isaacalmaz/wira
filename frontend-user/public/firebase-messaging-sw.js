importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAgX_LaIszGizE10NPivNZOyxU5Lb01VJU",
  authDomain: "wira-455d1.firebaseapp.com",
  projectId: "wira-455d1",
  storageBucket: "wira-455d1.firebasestorage.app",
  messagingSenderId: "975569594019",
  appId: "1:975569594019:web:3c789ddb3d0fd43adb4116"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
