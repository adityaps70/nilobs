// NilObs service worker: keeps the app usable at sea with no signal, and shows the daily drill reminder.
// The app is one HTML file, so caching it (plus icons) is enough. The AI and voice routes always
// need the network and are never cached here.
const CACHE = "nilobs-v4"
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
  // Pages: try the network first so updates arrive, fall back to the saved app offline. Only the app itself is
  // saved: other pages (policies, receipts, certificates) are never stored as it.
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    const app = url.pathname === "/" || url.pathname === "/index.html"
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && app) {
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

// Daily reminder: the server sends an empty push at the hour the user picked; we ask it what to say (it knows the
// streak, the inspection date and what's new), and fall back to a plain reminder if there's no signal.
self.addEventListener("push", (e) => {
  const tz = -new Date().getTimezoneOffset()
  const fallback = { title: "Today's drill is ready", body: "5 minutes on your weak spots.", url: "/#app/daily" }
  e.waitUntil(
    fetch(`/api/push/message?tz=${tz}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : fallback))
      .catch(() => fallback)
      .then((m) =>
        self.registration.showNotification(m.title || fallback.title, {
          body: m.body || fallback.body,
          icon: "/brand/nilobs-app-icon-192.png",
          badge: "/brand/nilobs-favicon-64.png",
          tag: "nilobs-daily",
          renotify: false,
          data: { url: m.url || fallback.url },
        })
      )
  )
})
self.addEventListener("notificationclick", (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || "/#app/today", self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin)
      if (open) return open.navigate(url).then((c) => (c || open).focus()).catch(() => open.focus())
      return self.clients.openWindow(url)
    })
  )
})
