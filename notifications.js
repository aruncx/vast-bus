// notifications.js
// Handles FCM permissions, token retrieval, and foreground messages

const vapidKey = 'BCTA1ASUj-M8z7b5Y_MHka-bq6MA4azaftCTyURjQpO1vrz1A3w4tQKlGO1Q2oy4XO3rNxfy6h6T41u0dVEsyoM';

// Access the messaging service (initialized in index.html after the SDK loads)
let messaging;
let latestToken = null;

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
    console.log('[FCM Debug] Requesting permission...');
    
    // Hide the hint immediately on click
    const hint = document.getElementById('notif-hint');
    if (hint) {
        hint.classList.add('hidden');
        localStorage.setItem('vast_notif_hint_dismissed', 'true');
    }

    try {
        const permission = await Notification.requestPermission();
        console.log('[FCM Debug] Permission status:', permission);
        
        if (permission === 'granted') {
            console.log('[FCM Debug] Initializing messaging...');
            if (!messaging) {
                console.log('[FCM Debug] Messaging instance missing, re-initializing...');
                initNotifications();
            }

            if (!messaging) {
                console.error('[FCM Debug] Failed to initialize messaging service. Are you on HTTPS?');
                showToast("FCM Init Failed. Check HTTPS.", "error");
                return false;
            }

            console.log('[FCM Debug] Fetching token with VAPID:', vapidKey);
            const token = await messaging.getToken({ vapidKey: vapidKey });
            
            if (token) {
                console.log('[FCM Debug] Success! Token:', token);
                latestToken = token;
                await saveTokenToDatabase(token);
                showToast("VAST Alerts Enabled! ✅", "success");
                return true;
            } else {
                console.warn('[FCM Debug] No token received. This could be a Service Worker registration issue.');
                showToast("Failed to get token. Refresh and try again.", "error");
                return false;
            }
        } else {
            console.warn('[FCM Debug] Notification permission denied or dismissed.');
            showToast("Notifications blocked. Enable in browser settings.", "error");
            return false;
        }
    } catch (err) {
        console.error('[FCM Debug] Error during subscription flow:', err);
        showToast("An error occurred. Check browser console.", "error");
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
    setTimeout(() => {
        initNotifications();
        checkAndShowHint();
    }, 1000);
});

// Show the 'Click Bell' hint if the user hasn't subscribed yet
function checkAndShowHint() {
    const hint = document.getElementById('notif-hint');
    if (!hint) return;

    // Don't show if already granted, or if they dismissed it before
    if (Notification.permission === 'granted' || localStorage.getItem('vast_notif_hint_dismissed')) {
        hint.classList.add('hidden');
    } else {
        hint.classList.remove('hidden');
    }
}

// Send a local test notification to verify OS-level permissions
function sendLocalTestNotification() {
    console.log('[FCM Debug] Triggering local test notification...');
    
    if (!("Notification" in window)) {
        showToast("This browser does not support notifications.", "error");
        return;
    }

    if (Notification.permission === "granted") {
        const options = {
            body: "If you can see this, your phone's notification system is working perfectly! ✅",
            icon: './assets/icon-180.png',
            badge: './assets/icon-32.png',
            vibrate: [200, 100, 200],
            tag: 'test-notification'
        };
        
        // Use service worker if available for a more realistic test
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("VAST System Test 🧪", options);
            });
        } else {
            // Fallback to basic window notification
            new Notification("VAST System Test 🧪", options);
        }
        showToast("Test sent! Check your notification bar.", "success");
    } else if (Notification.permission !== "denied") {
        showToast("Please click the Bell icon first to grant permission.", "info");
    } else {
        showToast("Notifications are BLOCKED in your phone settings.", "error");
    }
}

// Copy the latest FCM token to clipboard for debugging
async function copyPushToken() {
    if (!latestToken) {
        showToast("Fetching token... please wait.", "info");
        const success = await requestNotificationPermission();
        if (!success) return;
    }

    try {
        await navigator.clipboard.writeText(latestToken);
        const btn = document.getElementById('btn-copy-token');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            btn.style.background = "#10b981"; // Emerald
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = "rgba(255,255,255,0.1)";
            }, 2000);
        }
        showToast("Token copied to clipboard! ✅", "success");
    } catch (err) {
        console.error('Failed to copy: ', err);
        // Fallback for non-clipboard browsers
        prompt("Your Token (Copy manually):", latestToken);
    }
}
