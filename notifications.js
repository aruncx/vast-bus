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
    // Hide the hint immediately on click
    const hint = document.getElementById('notif-hint');
    if (hint) {
        hint.classList.add('hidden');
        localStorage.setItem('vast_notif_hint_dismissed', 'true');
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            if (!messaging) initNotifications();

            if (!messaging) {
                console.error('Messaging unavailable. Check HTTPS.');
                return false;
            }

            const token = await messaging.getToken({ vapidKey: vapidKey });
            if (token) {
                console.log('FCM Token generated successfully.');
                await saveTokenToDatabase(token);
                showToast("VAST Alerts Enabled! ✅", "success");
                return true;
            } else {
                console.warn('No registration token available.');
                return false;
            }
        } else {
            showToast("Notifications blocked. Enable in browser settings.", "error");
            return false;
        }
    } catch (err) {
        console.error('An error occurred during notification subscription:', err);
        return false;
    }
}

// Save token to Realtime Database
async function saveTokenToDatabase(token) {
    const user = firebase.auth().currentUser;
    const tokenKey = token.replace(/[.\$#\[\]\/]/g, "_");
    
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
        console.error("Error saving token to database:", e);
    }
}

// Handle messages when the app is in the foreground
function setupForegroundHandler() {
    messaging.onMessage((payload) => {
        const title = payload.notification.title || "New Alert";
        const body = payload.notification.body || "Check the dashboard for details.";
        showToast(`🔔 ${title}: ${body}`, "info");
    });
}

// Monitor token refresh
function setupTokenRefresh() {
    // messaging.onTokenRefresh is handled by getToken in newer SDKs
}

// Initialize when scripts load
window.addEventListener('load', () => {
    setTimeout(() => {
        initNotifications();
        checkAndShowHint();
    }, 1500);
});

// Show the 'Click Bell' hint if the user hasn't subscribed yet
function checkAndShowHint() {
    const hint = document.getElementById('notif-hint');
    const closeBtn = document.getElementById('close-notif-hint');
    if (!hint) return;

    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            hint.classList.add('hidden');
            localStorage.setItem('vast_notif_hint_dismissed', 'true');
        };
    }

    if (Notification.permission === 'granted' || localStorage.getItem('vast_notif_hint_dismissed')) {
        hint.classList.add('hidden');
    } else {
        hint.classList.remove('hidden');
    }
}
