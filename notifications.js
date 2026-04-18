// notifications.js
// Handles FCM permissions, token retrieval, and foreground messages

const vapidKey = 'BCTA1ASUj-M8z7b5Y_MHka-bq6MA4azaftCTyURjQpO1vrz1A3w4tQKlGO1Q2oy4XO3rNxfy6h6T41u0dVEsyoM';

// Access the messaging service (initialized in index.html after the SDK loads)
let messaging;

function initNotifications() {
    if (!firebase.apps.length) return;
    
    try {
        messaging = firebase.messaging();
        setupForegroundHandler();
        setupTokenRefresh();
    } catch (e) {
        console.warn("FCM not supported or failed to initialize:", e);
    }
}

// Request permission and get token
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            const token = await messaging.getToken({ vapidKey: vapidKey });
            if (token) {
                console.log('FCM Token:', token);
                await saveTokenToDatabase(token);
                showToast("VAST Alerts Enabled! ✅", "success");
                return true;
            } else {
                console.warn('No registration token available. Request permission to generate one.');
                return false;
            }
        } else {
            showToast("Notifications blocked. Enable in browser settings.", "error");
            return false;
        }
    } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
        return false;
    }
}

// Save token to Realtime Database
async function saveTokenToDatabase(token) {
    const user = firebase.auth().currentUser;
    // Create a safe key from the token (remove forbidden chars for Firebase keys: . $ # [ ] /)
    const tokenKey = token.replace(/[.\$#\[\]\/]/g, "_");
    
    // We store tokens under a flat list, but we tag them with the user UID if they are logged in
    const tokenData = {
        token: token,
        uid: user ? user.uid : "guest",
        email: user ? user.email : "guest",
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        last_updated: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        await firebase.database().ref('fcm_tokens/' + tokenKey).set(tokenData);
        console.log("Token registered in Database (" + (user ? "Linked to Account" : "Registered as Guest") + ")");
    } catch (e) {
        console.error("Error saving token to firebase:", e);
    }
}

// Handle messages when the app is in the foreground
function setupForegroundHandler() {
    messaging.onMessage((payload) => {
        console.log('Foreground message received: ', payload);
        
        // Use our existing custom toast system (alerts.js)
        const title = payload.notification.title || "New Alert";
        const body = payload.notification.body || "Check the dashboard for details.";
        
        showToast(`🔔 ${title}: ${body}`, "info");
    });
}

// Monitor token refresh
function setupTokenRefresh() {
    // In SDK v9+, this is handled differently, but for compat:
    // messaging.onTokenRefresh is mostly handled by getToken itself in new versions
}

// Initialize when scripts load
window.addEventListener('load', () => {
    // Wait a bit to ensure Firebase app is fully ready from tracking.js
    setTimeout(initNotifications, 1000);
});
