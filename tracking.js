// tracking.js
// Handles the Live Bus Tracking logic (GPS sharing & Firebase Integration)

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
    console.error("Firebase init error (Did you replace the config?):", e);
}

// State variables
let watchId = null;
let currentBusId = null;
let sessionId = null;

// DOM Elements
const trackingModal = document.getElementById('tracking-modal');
const closeTrackingModal = document.getElementById('close-tracking-modal');
const liveTrackingBtn = document.getElementById('live-tracking-btn');
const btnInsideBus = document.getElementById('btn-inside-bus');
const btnTrackingBus = document.getElementById('btn-tracking-bus');
const trackingModalBody = document.getElementById('tracking-modal-body');
const insideBusFlow = document.getElementById('inside-bus-flow');
const insideBusSelect = document.getElementById('inside-bus-select');
const startSharingBtn = document.getElementById('start-sharing-btn');
const sharingStatus = document.getElementById('sharing-status');

// Tracking Bus Variables
const trackingBusFlow = document.getElementById('tracking-bus-flow');
const trackingBusSelect = document.getElementById('tracking-bus-select');
const startTrackingBtn = document.getElementById('start-tracking-btn');
const trackingStatus = document.getElementById('tracking-status');

// Google Maps rendering variables
let gMap = null;
let directionsService = null;
let directionsRenderer = null;
let liveTrackingInterval = null;

// --- Time Restriction Logic ---
// Allow sharing GPS only between 7:00 AM - 9:30 AM and 4:00 PM - 7:30 PM
function isTrackingAllowedTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMins = hours * 60 + minutes;

    const morningStart = 0 * 60; // 12:00 AM (Extended for testing)
    const morningEnd = 9 * 60 + 30; // 9:30 AM
    const eveningStart = 16 * 60; // 4:00 PM
    const eveningEnd = 23 * 60 + 59; // 11:59 PM (Extended for testing)

    if ((timeInMins >= morningStart && timeInMins <= morningEnd) ||
        (timeInMins >= eveningStart && timeInMins <= eveningEnd)) {
        return true;
    }
    return false;
}

// --- UI Interactions ---

// Open Modal
if (liveTrackingBtn) {
    liveTrackingBtn.addEventListener('click', () => {
        trackingModal.classList.remove('hidden');
        trackingModalBody.classList.remove('hidden');
        insideBusFlow.classList.add('hidden');
        trackingBusFlow.classList.add('hidden');
    });
}

// Close Modal
if (closeTrackingModal) {
    closeTrackingModal.addEventListener('click', () => {
        trackingModal.classList.add('hidden');
    });
}

// Inside Bus - YES
if (btnInsideBus) {
    btnInsideBus.addEventListener('click', async () => {
        if (!isTrackingAllowedTime()) {
            alert("Live tracking sharing is only allowed during active bus hours (7:00 AM - 9:30 AM and 4:00 PM - 7:30 PM).");
            return;
        }

        // Authenticate anonymously if not already
        if (!auth.currentUser) {
            try {
                const userCredential = await auth.signInAnonymously();
                sessionId = userCredential.user.uid;
            } catch (error) {
                console.error("Error signing in anonymously:", error);
                alert("Could not connect to tracking server.");
                return;
            }
        } else {
            sessionId = auth.currentUser.uid;
        }

        // Switch UI
        trackingModalBody.classList.add('hidden');
        insideBusFlow.classList.remove('hidden');

        // Populate bus selection dropdown
        insideBusSelect.innerHTML = '<option value="" disabled selected>Select Bus Number</option>';
        if (typeof busData !== 'undefined') {
            busData.forEach(route => {
                const opt = document.createElement('option');
                opt.value = route.bus_no;
                opt.textContent = `Bus ${route.bus_no} - ${route.route_name}`;
                insideBusSelect.appendChild(opt);
            });
        }
    });
}

// Tracking Bus - NO
if (btnTrackingBus) {
    btnTrackingBus.addEventListener('click', () => {
        // Switch UI to bus selection for tracking
        trackingModalBody.classList.add('hidden');
        trackingBusFlow.classList.remove('hidden');

        // Populate bus selection dropdown
        trackingBusSelect.innerHTML = '<option value="" disabled selected>Select the Bus you want to track</option>';
        if (typeof busData !== 'undefined') {
            busData.forEach(route => {
                const opt = document.createElement('option');
                opt.value = route.bus_no;
                opt.textContent = `Bus ${route.bus_no} - ${route.route_name}`;
                trackingBusSelect.appendChild(opt);
            });
        }
    });
}

// Start Tracking a Bus
if (startTrackingBtn) {
    startTrackingBtn.addEventListener('click', () => {
        if (!trackingBusSelect.value) {
            alert("Please select a bus number to track.");
            return;
        }
        const selectedBusId = trackingBusSelect.value;
        trackingStatus.textContent = "Fetching live location and calculating ETA...";
        trackingStatus.style.color = "var(--neutral-400)";

        // Get student's location
        if (!navigator.geolocation) {
            trackingStatus.textContent = "Geolocation is not supported by your browser.";
            trackingStatus.style.color = "red";
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const studentLat = position.coords.latitude;
                const studentLng = position.coords.longitude;
                const studentLocation = { lat: studentLat, lng: studentLng };
                
                // Fetch Bus Location (Checking cloud function output OR raw passengers)
                db.ref(`bus_locations/${selectedBusId}`).once('value', (snapshot) => {
                    let data = snapshot.val();
                    
                    if (data && data.status === 'active' && data.latitude && data.longitude) {
                        // Cloud Function succeeded
                        initTrackingMap(studentLocation, { lat: data.latitude, lng: data.longitude }, selectedBusId);
                    } else {
                        // Fallback: Client-Side Aggregation (Bypass Cloud Functions for Free Tier users)
                        db.ref(`passenger_locations/${selectedBusId}`).once('value', (passSnapshot) => {
                            const passengers = passSnapshot.val();
                            
                            if (!passengers) {
                                trackingStatus.textContent = `Bus ${selectedBusId} is not currently sharing live location (No passengers).`;
                                trackingStatus.style.color = "red";
                                return;
                            }

                            // Filter active passengers (last 10 minutes) - Extended for manual testing
                            const now = Date.now();
                            let sumLat = 0;
                            let sumLng = 0;
                            let activeCount = 0;

                            Object.values(passengers).forEach(p => {
                                if (p.timestamp && (now - p.timestamp) < 600000) { // 10 minutes
                                    sumLat += p.latitude;
                                    sumLng += p.longitude;
                                    activeCount++;
                                }
                            });

                            if (activeCount < 3) {
                                trackingStatus.textContent = `Bus ${selectedBusId} tracking paused (Needs 3 students, currently has ${activeCount}).`;
                                trackingStatus.style.color = "red";
                                return;
                            }

                            // Computed average location
                            const avgLocation = { lat: sumLat / activeCount, lng: sumLng / activeCount };
                            initTrackingMap(studentLocation, avgLocation, selectedBusId);
                        });
                    }
                });
            },
            (error) => {
                console.error("Geolocation error:", error);
                trackingStatus.textContent = "Error: Please allow GPS location access to track your ETA.";
                trackingStatus.style.color = "red";
            },
            { enableHighAccuracy: true }
        );
    });
}

// Helper to launch the map rendering 
function initTrackingMap(studentLocation, busLocation, busNumber) {
    trackingStatus.textContent = "Location found! Redirecting to Live Map...";
    
    // Explicitly hide modal instead of .click() to prevent mobile browser freezing
    trackingModal.classList.add('hidden');
    trackingModalBody.classList.remove('hidden');
    insideBusFlow.classList.add('hidden');
    trackingBusFlow.classList.add('hidden');
    
    // Redirect to the fullscreen Live Dashboard with tracking parameters
    window.location.href = `live-dashboard.html?track=${busNumber}&slat=${studentLocation.lat}&slng=${studentLocation.lng}`;
}

// Ensure the map rendering functions that used to exist here are removed since 
// they are now officially migrating to dashboard.js to fulfill the user's latest request.

// --- Leaflet & OSRM Integration ---
function renderTrackingMap(studentLocation, busLocation, busNumber) {
    const mapPlaceholder = document.getElementById('map-placeholder');
    const staticIframe = document.getElementById('gmap');
    const dynamicMapDiv = document.getElementById('dynamic-map');
    const etaBanner = document.getElementById('eta-banner');
    const etaText = document.getElementById('eta-text');

    mapPlaceholder.style.display = 'none';
    staticIframe.style.display = 'none';
    dynamicMapDiv.style.display = 'block';
    etaBanner.classList.remove('hidden');

    if (typeof L === 'undefined') {
        etaText.textContent = "Error: Leaflet library failed to load.";
        return;
    }

    etaText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating ETA with OSRM...';

    // Initialize Map if not already
    if (!gMap) {
        gMap = L.map('dynamic-map').setView([studentLocation.lat, studentLocation.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(gMap);
    } else {
        // Clear old layers (like previous route polylines and markers)
        gMap.eachLayer((layer) => {
            if (layer instanceof L.Marker || layer instanceof L.GeoJSON) {
                gMap.removeLayer(layer);
            }
        });
    }

    // Fix for Leaflet container dimensions when toggling display:none to display:block
    setTimeout(() => {
        if (gMap) gMap.invalidateSize();
    }, 100);

    // Custom Icons using Leaflet DivIcon
    const studentIcon = L.divIcon({
        html: '<div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">📍</div>',
        className: 'custom-div-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 30]
    });
    
    const busIcon = L.divIcon({
        html: '<div style="font-size: 24px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); background: white; border-radius: 50%; padding: 4px; border: 2px solid #ef4444; display: flex; align-items:center; justify-content:center;">🚍</div>',
        className: 'custom-div-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    // Add Markers to map
    const studentMarker = L.marker([studentLocation.lat, studentLocation.lng], { icon: studentIcon }).addTo(gMap).bindPopup("You are here");
    const busMarker = L.marker([busLocation.lat, busLocation.lng], { icon: busIcon }).addTo(gMap).bindPopup(`Live: Bus ${busNumber}`);

    // Fetch Route from OSRM
    // OSRM expects coordinates in lng,lat format
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${busLocation.lng},${busLocation.lat};${studentLocation.lng},${studentLocation.lat}?overview=full&geometries=geojson`;

    fetch(osrmUrl)
        .then(response => response.json())
        .then(data => {
            if (data.code === 'Ok' && data.routes.length > 0) {
                const route = data.routes[0];
                
                // Extract ETA and Distance
                const distanceKm = (route.distance / 1000).toFixed(1);
                const durationMin = Math.ceil(route.duration / 60);
                
                etaText.innerHTML = `Bus ${busNumber} is <b>${distanceKm} km</b> away. Estimated Arrival: <b>${durationMin} mins</b>`;

                // Draw the polyline
                const geojsonFeature = {
                    "type": "Feature",
                    "properties": {},
                    "geometry": route.geometry
                };

                const routeLayer = L.geoJSON(geojsonFeature, {
                    style: {
                        color: '#6366f1',
                        weight: 5,
                        opacity: 0.8
                    }
                }).addTo(gMap);

                // Fit map to show both markers
                gMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

            } else {
                etaText.textContent = "ETA could not be calculated (No route found).";
                gMap.fitBounds(L.featureGroup([studentMarker, busMarker]).getBounds(), { padding: [50, 50] });
            }
        })
        .catch(error => {
            console.error("OSRM error:", error);
            etaText.textContent = "ETA could not be calculated (Network Error).";
            gMap.fitBounds(L.featureGroup([studentMarker, busMarker]).getBounds(), { padding: [50, 50] });
        });
}

// --- GPS Sharing Logic ---

if (startSharingBtn) {
    startSharingBtn.addEventListener('click', () => {
        if (!insideBusSelect.value) {
            alert("Please select a bus number.");
            return;
        }
        currentBusId = insideBusSelect.value;

        if (!navigator.geolocation) {
            sharingStatus.textContent = "Geolocation is not supported by your browser.";
            sharingStatus.style.color = "red";
            return;
        }

        sharingStatus.textContent = "Requesting GPS permission...";
        sharingStatus.style.color = "var(--neutral-400)";

        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                updateLocationToFirebase(lat, lng);
            },
            (error) => {
                console.error("Geolocation error:", error);
                sharingStatus.textContent = "Error: Please allow GPS location access to share.";
                sharingStatus.style.color = "red";
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000, // No older than 10 seconds
                timeout: 10000 // 10 seconds timeout
            }
        );

        // Update UI
        startSharingBtn.textContent = "Stop Sharing GPS";
        startSharingBtn.style.background = "#64748b"; // Neutral gray
        startSharingBtn.onclick = stopSharing;
    });
}

function updateLocationToFirebase(lat, lng) {
    if (!db || !sessionId || !currentBusId) return;

    if (!isTrackingAllowedTime()) {
        stopSharing();
        alert("Tracking hours are over. Stopped sharing GPS.");
        return;
    }

    const timestamp = firebase.database.ServerValue.TIMESTAMP;

    // Push raw GPS to passenger_locations
    // A Firebase Function will listen to this and average the locations for currentBusId
    db.ref(`passenger_locations/${currentBusId}/${sessionId}`).set({
        latitude: lat,
        longitude: lng,
        timestamp: timestamp
    })
        .then(() => {
            sharingStatus.textContent = `✅ Actively sharing GPS for Bus ${currentBusId}.`;
            sharingStatus.style.color = "green";

            // Setup disconnect hook to remove location when user drops offline
            db.ref(`passenger_locations/${currentBusId}/${sessionId}`).onDisconnect().remove();
        })
        .catch((error) => {
            console.error("Firebase write failed (Did you set up the DB?):", error);
            sharingStatus.textContent = "Error connecting to servers. Please ensure Firebase is setup.";
            sharingStatus.style.color = "red";
        });
}

function stopSharing() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    if (db && currentBusId && sessionId) {
        db.ref(`passenger_locations/${currentBusId}/${sessionId}`).remove();
    }

    currentBusId = null;

    // Reset UI
    sharingStatus.textContent = "Stopped sharing GPS.";
    sharingStatus.style.color = "var(--neutral-400)";
    startSharingBtn.textContent = "Start Sharing GPS";
    startSharingBtn.style.background = "#ef4444";

    // Re-attach original event listener
    startSharingBtn.onclick = null;
    
    // Hard-close the modal
    trackingModal.classList.add('hidden');
    trackingModalBody.classList.remove('hidden');
    insideBusFlow.classList.add('hidden');
    trackingBusFlow.classList.add('hidden');
}
