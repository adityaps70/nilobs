// NilObs service worker: keeps the app usable at sea with no signal.
// The app is one HTML file, so caching it (plus icons) is enough. The AI and voice routes always
// need the network and are never cached here.
const CACHE = "nilobs-v2"
const CORE = ["/", "/favicon.svg", "/manifest.webmanifest", "/brand/nilobs-app-icon-192.png", "/brand/nilobs-app-icon-512.png"]

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})
self.addEventListener("fetch", (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return
  // Pages: try the network first so updates arrive, fall back to the saved copy offline
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put("/", copy))
          }
          return res
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    )
    return
  }
  // Static files: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy))
    }
    return res
  })))
})
