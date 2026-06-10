// Service worker — v4 release.
// Strategy:
//   * Navigation (HTML), CSS, JS, GLB, USDZ, MJS:  network-first with
//     cache fallback (deploys are seen on next reload; offline still works).
//   * Everything else (icons, fonts, textures):     cache-first (immutable-ish).
//   * SSE endpoints (chat-stream):                  bypassed entirely;
//     a SW that buffers an event-stream would break streaming.
const CACHE_NAME = "miaomiao-v11";
// Precache only STABLE-path assets. Since the Vite migration the JS/CSS ship as
// hashed `assets/*.js|css` chunks (the old `./src/*.js` + `./style.css` here all
// 404'd → the cache stayed empty). Those hashed bundles are now picked up by the
// runtime network-first strategy below on the first online load, so offline still
// works after one visit — without a build-time precache manifest (vite-plugin-pwa).
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

function isFresh(url) {
  return url.endsWith(".html") || url.endsWith("/") ||
         url.endsWith(".glb") || url.endsWith(".js") ||
         url.endsWith(".mjs") || url.endsWith(".usdz") ||
         url.endsWith(".css");
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = e.request.url;
  // Don't touch cross-origin traffic — model-viewer CDN, worker API,
  // analytics, etc. all need to reach the network directly.
  if (new URL(url).origin !== self.location.origin) return;
  // Never cache or buffer streaming endpoints (no SSE → SW buffering).
  if (url.includes("/api/")) return;

  const isNav = e.request.mode === "navigate" || isFresh(url);
  if (isNav) {
    e.respondWith(
      fetch(e.request, { cache: "reload" }).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }))
  );
});
