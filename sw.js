const CACHE_NAME = 'vast-bus-v1.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './live-dashboard.html',
    './styles.css',
    './script.js',
    './alerts.js',
    './bus-cursor.js',
    './tracking.js',
    './dashboard.js',
    './data.json',
    './manifest.json',
    './preview.png'
];

// Install Event: Cache all critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Stale-While-Revalidate Strategy
// We serve the cached file instantly for speed & offline use, then ping the network to grab an invisibly updated version for the NEXT time they visit!
self.addEventListener('fetch', (event) => {
    // We only want to cache GET requests targeting our own origin or known CDNs we care about
    if (event.request.method !== 'GET') return;

    // Ignore Firebase Database streaming connections; these must be purely network-driven
    if (event.request.url.includes('firebaseio.com') || event.request.url.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Initiate a network fetch to get the newest version
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    // Update the cache with the new network response
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                });
                return networkResponse;
            }).catch(() => {
                // If network fails (Offline mode), we just gracefully fail the fetch.
                // The cache will fulfill the request!
            });

            // Return the cached response instantly, or wait for the network one if it isn't cached yet.
            return cachedResponse || fetchPromise;
        })
    );
});
