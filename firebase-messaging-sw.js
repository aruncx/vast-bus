// firebase-messaging-sw.js
// This service worker handles background push notifications when the app is closed.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Must match the config in tracking.js
const firebaseConfig = {
    apiKey: "AIzaSyAfQWJqU-jo1OQMukEm9fqwE6evuCeFX9w",
    authDomain: "vast-bus-tracking-2026.firebaseapp.com",
    databaseURL: "https://vast-bus-tracking-2026-default-rtdb.firebaseio.com",
    projectId: "vast-bus-tracking-2026",
    storageBucket: "vast-bus-tracking-2026.firebasestorage.app",
    messagingSenderId: "1015271984923",
    appId: "1:1015271984923:web:5e3c2f235e5c9059b28dbe"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/assets/icon-180.png',
        badge: '/assets/icon-32.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
