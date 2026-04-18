// dashboard.js
// Handles displaying all active buses on the live dashboard

/* ── Casual Security Measures ── */
document.addEventListener('contextmenu', e => e.preventDefault());
document.onkeydown = (e) => {
    if (e.keyCode == 123 || 
       (e.ctrlKey && e.shiftKey && (e.keyCode == 'I'.charCodeAt(0) || e.keyCode == 'J'.charCodeAt(0))) || 
       (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0))) {
        return false;
    }
};

// TODO: Replace with your actual Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAfQWJqU-jo1OQMukEm9fqwE6evuCeFX9w",
    authDomain: "vast-bus-tracking-2026.firebaseapp.com",
    databaseURL: "https://vast-bus-tracking-2026-default-rtdb.firebaseio.com",
    projectId: "vast-bus-tracking-2026",
    storageBucket: "vast-bus-tracking-2026.firebasestorage.app",
    messagingSenderId: "1015271984923",
    appId: "1:1015271984923:web:5e3c2f235e5c9059b28dbe"
};

// Initialize Firebase
let app, auth, db;
try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.database();
} catch (e) {
    console.error("Firebase init error:", e);
}

// --- Auth Guard Logic ---

// --- Initial Map Load ---
// Instantly initialize the map because they would only get this link if they were already logged in!
initDashboard();

// --- Background Profile Fetch ---
if (auth) {
    auth.onAuthStateChanged((user) => {
        const dashUser = document.getElementById('dashboard-user');
        const dashUserName = document.getElementById('dash-user-name');
        const dashUserPhoto = document.getElementById('dash-user-photo');

        if (user && user.email && user.email.endsWith('@vidyaacademy.ac.in')) {
            // Authorized silently in background
            if (dashUser) dashUser.style.display = 'flex';
            if (dashUserName) dashUserName.textContent = user.displayName || "Student";
            if (dashUserPhoto && user.photoURL) dashUserPhoto.src = user.photoURL;
        } else {
            // If they manually typed this URL and aren't logged in, silently boot them out
            window.location.href = 'index.html';
        }
    });
}
// Wrap existing logic into initDashboard function
let isDashboardInitialized = false;
function initDashboard() {
    if (isDashboardInitialized) return;
    isDashboardInitialized = true;

    // Center the map roughly around Thrissur, Kerala (VAST location area)
const urlParams = new URLSearchParams(window.location.search);
const trackedBusId = urlParams.get('track');
const studentLat = parseFloat(urlParams.get('slat'));
const studentLng = parseFloat(urlParams.get('slng'));

// Tracking State
let isTrackingMode = !!(trackedBusId && studentLat && studentLng);
let routePolyline = null;
let lastRouteFetchTime = 0;
const OSRM_FETCH_INTERVAL = 15000; // 15 seconds limit to prevent API spam

// UI Elements
const etaOverlay = document.getElementById('eta-overlay');
const etaTextContent = document.getElementById('eta-text-content');

// Show Tracking Banner if in Tracking Mode
if (isTrackingMode && etaOverlay) {
    etaOverlay.classList.remove('hidden');
}

// Initialize Leaflet Map
// Center the map roughly around Thrissur, Kerala (VAST location area)
const initialLat = 10.6133;
const initialLng = 76.1265;
const map = L.map('live-map').setView([initialLat, initialLng], 11);

// Add high-performance tiles (CartoDB Voyager matches our professional aesthetic)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Add college marker
const collegeIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="bus-marker-icon" style="background:#f59e0b; font-size: 1rem;"><i class="fa-solid fa-graduation-cap"></i></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});
L.marker([10.6133, 76.1265], { icon: collegeIcon }).addTo(map)
    .bindPopup(`
        <div class="bus-tooltip">
            <strong>VAST College</strong>
            <span style="font-size: 0.8rem; color: #666;">Vidya Academy of Science & Technology</span>
        </div>
    `);


// Store active markers to update them instead of redrawing
const busMarkers = {};

// If tracking mode, add student marker and center map
if (isTrackingMode) {
    map.setView([studentLat, studentLng], 13);
    const studentIcon = L.divIcon({
        html: '<div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>',
        className: 'custom-div-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });
    L.marker([studentLat, studentLng], { icon: studentIcon }).addTo(map)
        .bindPopup("<strong>You are here</strong>").openPopup();
}

// Listen to Firebase passenger_locations directly
if (db) {
    // We listen to passenger_locations because Cloud Functions (which normally write to bus_locations)
    // require a paid Blaze plan. This client-side fallback makes the system 100% free!
    const locationsRef = db.ref('passenger_locations');

    locationsRef.on('value', (snapshot) => {
        const allBuses = snapshot.val();
        
        // If there's no data at all, clear all markers
        if (!allBuses) {
            Object.keys(busMarkers).forEach(id => map.removeLayer(busMarkers[id]));
            for (let prop in busMarkers) delete busMarkers[prop];
            return;
        }

        const now = Date.now();

        // Iterate through all buses that have passengers
        Object.keys(allBuses).forEach(busId => {
            const passengers = allBuses[busId];
            
            let sumLat = 0;
            let sumLng = 0;
            let activeCount = 0;
            let newestTimestamp = 0;

            // Compute active passengers
            Object.values(passengers).forEach(p => {
                if (p.timestamp && (now - p.timestamp) < 600000) { // 10 minutes timeout for beta testing
                    sumLat += p.latitude;
                    sumLng += p.longitude;
                    activeCount++;
                    if (p.timestamp > newestTimestamp) newestTimestamp = p.timestamp;
                }
            });

            // Check if status is active (We need 3 students. Let's strictly enforce this)
            const isActive = activeCount >= 3;

            if (isActive) {
                const latLng = [sumLat / activeCount, sumLng / activeCount];
                const lastUpdatedDate = new Date(newestTimestamp || Date.now());
                const timeString = lastUpdatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // If marker exists, update it
                if (busMarkers[busId]) {
                    busMarkers[busId].setLatLng(latLng);
                    busMarkers[busId].setPopupContent(`
                        <div class="bus-tooltip">
                            <strong>Bus ${busId}</strong><br>
                            Tracking with ${activeCount} students<br>
                            <span class="status-badge status-active" style="display:inline-block; margin-top:5px; padding: 2px 6px; background:#10b981; color:white; border-radius:4px; font-size:10px;">ACTIVE</span><br>
                            <small>Updated: ${timeString}</small>
                        </div>
                    `);
                } else {
                    // Create new marker with Bus Number visibly overlayed
                    const busIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `
                            <div class="bus-marker-icon marker-active" style="background: white; border-radius: 50%; padding: 4px; border: 2px solid #ef4444; display: flex; flex-direction:column; align-items:center; justify-content:center; width:44px; height:44px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                                <span style="font-size: 16px; line-height: 1;">🚍</span>
                                <span style="font-weight: 800; font-family: 'Inter', sans-serif; font-size: 11px; color: #ef4444; margin-top: 1px;">${busId}</span>
                            </div>
                        `,
                        iconSize: [44, 44],
                        iconAnchor: [22, 22]
                    });

                    const marker = L.marker(latLng, { icon: busIcon }).addTo(map)
                        .bindPopup(`
                            <div class="bus-tooltip">
                                <strong>Bus ${busId}</strong><br>
                                Tracking with ${activeCount} students<br>
                                <span class="status-badge status-active" style="display:inline-block; margin-top:5px; padding: 2px 6px; background:#10b981; color:white; border-radius:4px; font-size:10px;">ACTIVE</span><br>
                                <small>Updated: ${timeString}</small>
                            </div>
                        `);

                    busMarkers[busId] = marker;
                }

                // --- Live Tracking Route & ETA Logic ---
                if (isTrackingMode && busId === trackedBusId) {
                    const nowTime = Date.now();
                    
                    // Only fetch OSRM route if we haven't checked recently to avoid API spam
                    if (nowTime - lastRouteFetchTime > OSRM_FETCH_INTERVAL) {
                        lastRouteFetchTime = nowTime;
                        
                        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${latLng[1]},${latLng[0]};${studentLng},${studentLat}?overview=full&geometries=geojson`;

                        fetch(osrmUrl)
                            .then(res => res.json())
                            .then(data => {
                                if (data.code === 'Ok' && data.routes.length > 0) {
                                    const route = data.routes[0];
                                    
                                    // Extract ETA and Distance
                                    const distanceKm = (route.distance / 1000).toFixed(1);
                                    const durationMin = Math.ceil(route.duration / 60);
                                    
                                    if (etaTextContent) {
                                        etaTextContent.innerHTML = `Bus ${busId} is <b>${distanceKm} km</b> away. ETA: <b>${durationMin} min</b>`;
                                        etaOverlay.querySelector('.fa-spinner')?.classList.add('hidden'); // hide spinner after first load
                                    }

                                    // Replace polyline
                                    if (routePolyline) map.removeLayer(routePolyline);
                                    
                                    routePolyline = L.geoJSON({
                                        "type": "Feature",
                                        "geometry": route.geometry
                                    }, {
                                        style: { color: '#6366f1', weight: 5, opacity: 0.8 }
                                    }).addTo(map);

                                    // Auto fit bounds to show bus and student
                                    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
                                }
                            })
                            .catch(err => console.error("OSRM Routing Error:", err));
                    }
                }
            } else {
                // If inactive, remove marker if it exists
                if (busMarkers[busId]) {
                    map.removeLayer(busMarkers[busId]);
                    delete busMarkers[busId];
                }
            }
        });
        
        // Also cleanup markers for buses that disappeared from the database completely
        Object.keys(busMarkers).forEach(existingBusId => {
            if (!allBuses[existingBusId]) {
                map.removeLayer(busMarkers[existingBusId]);
                delete busMarkers[existingBusId];
            }
        });
    });
} else {
    console.warn("Database not initialized. Ensure Firebase credentials are set.");
}
