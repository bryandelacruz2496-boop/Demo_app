const CACHE_NAME = 'beatasai-v1';
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
    '/logo.png'
];

// Install - cache files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
        )
    );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
