// Service worker with cache-busting strategy.
// v2: invalidates v1, uses network-first for GLB/JS (so animation updates show immediately).
const CACHE_NAME = "miaomiao-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;

  const url = e.request.url;
  // Network-first for navigation (HTML) and files that change often (GLB, JS, USDZ, CSS).
  // Avoids the trap where users get stuck on an old cached index.html after deploys.
  const isNav = e.request.mode === "navigate" || url.endsWith(".html") || url.endsWith("/");
  if (isNav || url.endsWith(".glb") || url.endsWith(".js") || url.endsWith(".usdz") || url.endsWith(".css")) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }))
  );
});
