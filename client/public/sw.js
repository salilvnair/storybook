/**
 * iStorybook Service Worker — S55 (Offline / PWA).
 *
 * Strategy:
 * - App shell (HTML, CSS, JS): Cache-first (serve from cache, update in background).
 * - API calls: Network-first with fallback to cache for GET requests.
 * - Story images/PDFs: Cache-first (story bundles are immutable once generated).
 *
 * Offline library: stories already fetched are available offline via cached API responses.
 * Offline generation: requires a local engine running (no internet needed for generation).
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `istorybook-shell-${CACHE_VERSION}`;
const STORY_CACHE = `istorybook-stories-${CACHE_VERSION}`;
const API_CACHE = `istorybook-api-${CACHE_VERSION}`;

const SHELL_URLS = ['/', '/index.html'];

// ── Install: cache the app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => ![SHELL_CACHE, STORY_CACHE, API_CACHE].includes(k))
        .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route strategy ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Story images and PDFs — cache-first (immutable once generated)
  if (url.pathname.match(/^\/api\/stories\/.+\/(cover|page|pdf|epub)/)) {
    event.respondWith(cacheFirst(event.request, STORY_CACHE));
    return;
  }

  // API GET requests — network-first, fallback to cache
  if (url.pathname.startsWith('/api/') && event.request.method === 'GET') {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // App shell — cache-first
  if (!url.pathname.startsWith('/api/') && event.request.mode === 'navigate') {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  // Static assets — stale-while-revalidate
  if (url.pathname.match(/\.(js|css|wasm|woff2|png|ico|svg)$/)) {
    event.respondWith(staleWhileRevalidate(event.request, SHELL_CACHE));
    return;
  }

  // Everything else — network only
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{"error":"Offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((resp) => {
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ── Background sync for offline story saves ──────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-stories') {
    event.waitUntil(syncPendingStories());
  }
});

async function syncPendingStories() {
  // No-op for now; future: sync locally-created stories to remote
}
