// notifications.js
// Handles FCM permissions, token retrieval, and foreground messages

const vapidKey = 'BCTA1ASUj-M8z7b5Y_MHka-bq6MA4azaftCTyURjQpO1vrz1A3w4tQKlGO1Q2oy4XO3rNxfy6h6T41u0dVEsyoM';

// Access the messaging service (initialized in index.html after the SDK loads)
let messaging;
let latestToken = null;

// On-screen debugger for mobile
function debugLog(message, type = 'log') {
    const consoleContent = document.getElementById('debug-log-content');
    if (!consoleContent) {
        console.log(`[FCM Debug Console Missing] ${message}`);
        return;
    }
    
    if (consoleContent.innerHTML === "Waiting for action...") {
        consoleContent.innerHTML = "";
    }
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
    const color = type === 'error' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : '#10b981');
    const logEntry = `<div style="margin-bottom: 2px;"><span style="color: #666; font-size: 0.6rem;">[${timestamp}]</span> <span style="color: ${color};">${message}</span></div>`;
    
    consoleContent.innerHTML = logEntry + consoleContent.innerHTML;
    console[type](`[FCM Debug] ${message}`);
}

function initNotifications() {
    debugLog("Initializing Notification Service...");
    if (!firebase.apps.length) {
        debugLog("Error: Firebase App not initialized in tracking.js", "error");
        return;
    }
    
    try {
        messaging = firebase.messaging();
        debugLog("FCM Messaging initialized locally.");
        setupForegroundHandler();
        setupTokenRefresh();
    } catch (e) {
        debugLog("FCM init failed: " + e.message, "error");
        console.warn("FCM check failed:", e);
    }
}

// Request permission and get token
async function requestNotificationPermission() {
    debugLog("Requesting OS Permission...");
    
    // Hide the hint immediately on click
    const hint = document.getElementById('notif-hint');
    if (hint) {
        hint.classList.add('hidden');
        localStorage.setItem('vast_notif_hint_dismissed', 'true');
    }

    try {
        const permission = await Notification.requestPermission();
        debugLog("User Permission Result: " + permission);
        
        if (permission === 'granted') {
            if (!messaging) {
                debugLog("Re-initializing missing messaging instance...");
                initNotifications();
            }

            if (!messaging) {
                debugLog("Critical: Messaging still unavailable. Check HTTPS/SW.", "error");
                showToast("FCM Init Failed. Check HTTPS.", "error");
                return false;
            }

            debugLog("Requesting FCM Token from Firebase...");
            const token = await messaging.getToken({ vapidKey: vapidKey });
            
            if (token) {
                debugLog("TOKEN RECEIVED SUCCESSFULLY! ✅");
                latestToken = token;
                await saveTokenToDatabase(token);
                showToast("VAST Alerts Enabled! ✅", "success");
                return true;
            } else {
                debugLog("No Token received. Check if SW exists at root.", "warn");
                return false;
            }
        } else {
            debugLog("Permission denied/dismissed.", "warn");
            showToast("Notifications blocked. Enable in settings.", "error");
            return false;
        }
    } catch (err) {
        debugLog("Flow Error: " + err.message, "error");
        return false;
    }
}

// Save token to Realtime Database
async function saveTokenToDatabase(token) {
    debugLog("Saving token to Database...");
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
        debugLog("Token saved to Database. 💾");
    } catch (e) {
        debugLog("Database Error: " + e.message, "error");
    }
}

// Handle messages when the app is in the foreground
function setupForegroundHandler() {
    messaging.onMessage((payload) => {
        debugLog("Foreground Message Received! 🔔");
        const title = payload.notification.title || "New Alert";
        const body = payload.notification.body || "Check the dashboard.";
        showToast(`🔔 ${title}: ${body}`, "info");
    });
}

// Monitor token refresh
function setupTokenRefresh() {
    // messaging.onTokenRefresh is mostly handled by getToken itself in compat
}

// Initialize when scripts load
window.addEventListener('load', () => {
    setTimeout(() => {
        initNotifications();
        checkAndShowHint();
        debugLog("Diagnostic Suite Ready.");
    }, 1500);
});

// Show the 'Click Bell' hint if the user hasn't subscribed yet
function checkAndShowHint() {
    const hint = document.getElementById('notif-hint');
    if (!hint) return;

    if (Notification.permission === 'granted' || localStorage.getItem('vast_notif_hint_dismissed')) {
        hint.classList.add('hidden');
    } else {
        hint.classList.remove('hidden');
    }
}

// Send a local test notification to verify OS-level permissions
function sendLocalTestNotification() {
    debugLog("Firing Local Test Notification...");
    
    if (!("Notification" in window)) {
        debugLog("Error: Browser lacks Notification support.", "error");
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
        
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification("VAST System Test 🧪", options);
                debugLog("Local Test Sent via SW.");
            });
        } else {
            new Notification("VAST System Test 🧪", options);
            debugLog("Local Test Sent via Window.");
        }
        showToast("Test sent! Check your notification bar.", "success");
    } else {
        debugLog("Error: Local Test failed - Permission denied.", "error");
        showToast("Grant permission via Bell icon first.", "info");
    }
}

// Copy the latest FCM token to clipboard for debugging
async function copyPushToken() {
    debugLog("Copying Token to clipboard...");
    
    if (!latestToken) {
        debugLog("Token not found in memory. Attempting retrieval...");
        const success = await requestNotificationPermission();
        if (!success) {
            debugLog("Retrieval attempt failed.", "error");
            return;
        }
    }

    try {
        await navigator.clipboard.writeText(latestToken);
        debugLog("Manual Copy successful! ✅");
        
        const btn = document.getElementById('btn-copy-token');
        if (btn) {
            const originalInner = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            btn.style.background = "#059669";
            setTimeout(() => {
                btn.innerHTML = originalInner;
                btn.style.background = "rgba(255,255,255,0.1)";
            }, 3000);
        }
        showToast("Token copied! ✅", "success");
    } catch (err) {
        debugLog("Clipboard Blocked. Opening Fallback Prompt...", "warn");
        window.prompt("Copy this Token manualy:", latestToken);
    }
}
