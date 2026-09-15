// Minimal app-shell service worker for the CampusGuard student PWA.
//
// This exists ONLY to satisfy PWA installability (Chrome/Android require a
// registered service worker with a fetch handler) and to let the static
// app-shell (HTML/CSS/JS) load a little faster / survive a flaky connection.
// It deliberately does NOT cache anything under /api/ — presence status and
// QR sessions must always come from the network, never a stale cache. An
// installed app that silently showed "OUTSIDE" from yesterday's cache, or
// let a scan succeed against a cached (already-expired) QR check, would be
// a real safety problem, not just a UX one.
const CACHE_NAME = "campusguard-shell-v1";
const APP_SHELL = ["/student", "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Fine if this fails offline-first on a fresh install — the fetch
        // handler below still works, just without a warm cache yet.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle same-origin, safe, non-API GETs. Everything else
  // (POST scans/exits, all /api/* reads, cross-origin requests) passes
  // straight through to the network untouched.
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
