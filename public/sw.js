/**
 * SL-FLIX Service Worker
 * Provides offline caching and faster loading through Workbox strategies
 * 
 * Strategies:
 * - Cache First: Static assets (JS, CSS, images)
 * - Network First: API calls
 * - Stale While Revalidate: Home page data
 */

const CACHE_NAME = 'slflix-v1';
const API_CACHE_NAME = 'slflix-api-v1';
const IMAGE_CACHE_NAME = 'slflix-images-v1';

// Cache durations
const STATIC_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const IMAGE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] Static assets cached');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME && name !== IMAGE_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - handle all requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip caching for video streams and highly dynamic data
  if (url.pathname.startsWith('/api/stream/') || url.pathname.includes('/tv/guide')) {
    return;
  }

  // Handle images - Cache First with network fallback
  if (isImageRequest(request) || url.pathname.startsWith('/api/tv/img')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE_NAME, IMAGE_CACHE_DURATION));
    return;
  }

  // Handle API requests - Network First
  if (url.pathname.startsWith('/api-') || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE_NAME, API_CACHE_DURATION));
    return;
  }

  // Handle static assets - Cache First
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, CACHE_NAME, STATIC_CACHE_DURATION));
    return;
  }

  // Handle navigation requests - Network First
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_NAME, STATIC_CACHE_DURATION));
    return;
  }

  // Default - Network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// Cache First strategy - check cache, fallback to network
async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse && !isCacheableResponse(cachedResponse)) {
    await cache.delete(request);
  }
  if (cachedResponse && isCacheableResponse(cachedResponse)) {
    // Check if cache is stale
    const dateHeader = cachedResponse.headers.get('date');
    if (dateHeader) {
      const cacheAge = Date.now() - new Date(dateHeader).getTime();
      if (cacheAge > maxAge) {
        // Fetch fresh data in background
        fetchAndCache(request, cacheName, maxAge);
      }
    }
    return cachedResponse;
  }

  // Cache miss - fetch from network
  return fetchAndCache(request, cacheName, maxAge);
}

// Network First strategy - try network, fallback to cache
async function networkFirst(request, cacheName, maxAge) {
  try {
    const networkResponse = await fetch(request);
    
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error(`Uncacheable response: ${networkResponse.status}`);
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse && isCacheableResponse(cachedResponse)) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Network with cache fallback
async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Fetch and cache helper
async function fetchAndCache(request, cacheName, maxAge) {
  try {
    const networkResponse = await fetch(request);
    
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(cacheName);
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
      return networkResponse;
    }
    throw new Error(`Uncacheable response: ${networkResponse.status}`);
  } catch (error) {
    console.log('[SW] Fetch failed:', request.url, error);
    throw error;
  }
}

function isCacheableResponse(response) {
  return Boolean(response && response.ok && response.type !== 'opaque');
}

// Check if request is for static assets
function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.ico')
  );
}

// Check if request is for images
function isImageRequest(request) {
  const url = new URL(request.url);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico'];
  return imageExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext)) ||
         url.pathname.includes('/images/') ||
         url.pathname.includes('/covers/') ||
         url.pathname.includes('/posters/') ||
         url.pathname.includes('.cloudfront.net') ||
         url.pathname.includes('.imgbox.com') ||
         url.pathname.includes('.media-imdb.com');
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((name) => {
        caches.delete(name);
      });
    });
  }
  
  if (event.data && event.data.type === 'PREFETCH') {
    const { urls } = event.data;
    if (Array.isArray(urls)) {
      urls.forEach((url) => {
        fetch(url, { mode: 'cors' }).catch(() => {});
      });
    }
  }
});

// Background sync for analytics (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    console.log('[SW] Background sync triggered');
  }
});

console.log('[SW] Service worker loaded');

