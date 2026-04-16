/**
 * Live Alert System for VAST College Bus
 * Fetches dynamic messages/notifications from a Google Sheet and displays them on the website.
 */

// Use the user's provided Google Sheet ID and Sheet Name
const SPREADSHEET_ID = '1Vqynss_ixpzUQOgGCZIcTFRKC9dEEeqDh40O9RrI8AQ';
const SHEET_NAME = 'Sheet1';
const API_URL = `https://opensheet.elk.sh/${SPREADSHEET_ID}/${SHEET_NAME}`;

// How often to check for new alerts (in milliseconds) - 45 seconds
const REFRESH_INTERVAL = 45000;

// Keep track of which messages have already triggered a toast popup
let shownToastIds = new Set();

/**
 * Format today's date to match 'DD-MM-YYYY' format
 */
function getTodayFormatted() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
    const yyyy = today.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

/**
 * Generate a unique ID for a message based on its content (to prevent duplicate toasts)
 */
function generateMessageId(messageObj) {
    if (!messageObj || !messageObj.Message) return '';
    return btoa(messageObj.Message + messageObj.Date).substring(0, 15);
}

/**
 * Main function to fetch, filter, and render alerts
 */
async function fetchAndDisplayAlerts() {
    try {
        // Fetch data from the Google Sheet API
        const response = await fetch(API_URL);
        
        // Handle invalid response (e.g. placeholders aren't replaced yet)
        if (!response.ok) {
            console.warn("Alert System: Could not fetch data. Ensure SPREADSHEET_ID and SHEET_NAME are correct.");
            return;
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) return;

        const todayDateStr = getTodayFormatted();

        // 1. Filter Logic: Status = "Active" AND Date = Today
        const activeAlerts = data.filter(item => {
            return item.Status && item.Status.trim().toLowerCase() === "active" && 
                   item.Date && item.Date.trim() === todayDateStr;
        });

        // 2. Render Ticker
        renderTicker(activeAlerts);

        // 3. Render Toasts for new messages
        activeAlerts.forEach(alert => {
            const msgId = generateMessageId(alert);
            if (!shownToastIds.has(msgId)) {
                showToast(alert);
                shownToastIds.add(msgId);
            }
        });

    } catch (error) {
        console.error("Alert System Error:", error);
    }
}

/**
 * Render the scrolling alert banner (ticker)
 */
function renderTicker(alerts) {
    const bannerContainer = document.getElementById('alert-banner-container');
    if (!bannerContainer) return;

    if (alerts.length === 0) {
        // Handle Empty State
        bannerContainer.style.display = 'none';
        bannerContainer.innerHTML = '';
        return;
    }

    // Determine highest priority for the container styling
    const hasHigh = alerts.some(a => a.Priority === 'High');
    const hasMedium = alerts.some(a => a.Priority === 'Medium');
    
    let containerClass = 'alert-container-low';
    if (hasHigh) containerClass = 'alert-container-high';
    else if (hasMedium) containerClass = 'alert-container-medium';

    bannerContainer.style.display = 'flex';
    bannerContainer.className = `alert-banner-container ${containerClass}`;

    // Join all messages into a single string with separators
    const formattedMessages = alerts.map(alert => {
        let icon = '<i class="fa-solid fa-circle-info"></i>';
        if (alert.Priority === 'High') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (alert.Priority === 'Medium') icon = '<i class="fa-solid fa-circle-exclamation"></i>';

        return `<span class="alert-item priority-${alert.Priority.toLowerCase()}">${icon} <strong>${alert.Priority.toUpperCase()} ALERT:</strong> ${alert.Message}</span>`;
    }).join('<span class="alert-separator"></span>');

    bannerContainer.innerHTML = `
        <div class="alert-ticker-wrap">
            <div class="alert-ticker">
                ${formattedMessages}
            </div>
            <!-- Duplicate for seamless infinite scrolling -->
            <div class="alert-ticker" aria-hidden="true">
                ${formattedMessages}
            </div>
        </div>
        <div class="alert-label">
            <i class="fa-solid fa-bell"></i> LIVE UPDATES
        </div>
        <button class="alert-close-btn" aria-label="Dismiss Alert" onclick="document.getElementById('alert-banner-container').style.display='none'">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
}

/**
 * Display a toast notification popup
 */
function showToast(alert) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `alert-toast toast-${alert.Priority.toLowerCase()} animate-slide-in`;
    
    let iconClass = 'fa-circle-info';
    if (alert.Priority === 'High') iconClass = 'fa-triangle-exclamation';
    if (alert.Priority === 'Medium') iconClass = 'fa-circle-exclamation';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <h4 class="toast-title">${alert.Priority} Priority</h4>
            <p class="toast-message">${alert.Message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    toastContainer.appendChild(toast);

    // Auto dismiss after 8 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('animate-fade-out');
            setTimeout(() => toast.remove(), 500); // Wait for fade-out animation
        }
    }, 8000);
}

// Initialize Alert System when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchAndDisplayAlerts();

    // Setup auto-refresh
    setInterval(fetchAndDisplayAlerts, REFRESH_INTERVAL);
});
