const CACHE_NAME = 'beatasai-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/admin.html',
    '/student-login.html',
    '/style.css',
    '/admin-portal.css',
    '/student-portal.css',
    '/script.js',
    '/admin-portal.js',
    '/student-portal.js',
    '/logo.jpg'
];

// Install - cache files
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Activate - clean old caches and take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone and update cache with fresh response
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});



