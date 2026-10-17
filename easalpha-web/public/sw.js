/* EasAlpha service worker: caches the app shell so /pos, /kitchen, /token and the rider app open offline (data lives in
   IndexedDB or localStorage) and shows browser push notifications for the admin, till, kitchen and rider apps, even
   while no tab is open. Restaurant customer apps (/store/<slug>) use it to install and to reopen their last page. */
const VERSION = "easalpha-shell-v3";
const SHELL = ["/pos", "/pos/pin", "/pos/orders", "/pos/shift", "/pos/attention", "/kitchen", "/token", "/rider", "/rider/pin", "/rider/pair", "/manifest.json", "/manifest-rider.json", "/icon.svg", "/icon-192.png"];

/** With no signal, a page falls back to the cached copy of itself, else to the start page of the app it belongs to. */
function offlineFallback(pathname) {
  if (pathname.startsWith("/rider")) return "/rider";
  if (pathname.startsWith("/pos")) return "/pos";
  if (pathname.startsWith("/kitchen")) return "/kitchen";
  if (pathname.startsWith("/token")) return "/token";
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API and cable go straight to the network
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((hit) => { if (hit) return hit; const f = offlineFallback(url.pathname); return f ? caches.match(f) : undefined; }).then((res) => res || new Response("<h1>No connection</h1><p>Reconnect and try again.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }))),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".png") || url.pathname.endsWith(".json")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
  }
});

// The page sends the scripts and styles it loaded so the next visit opens with no signal (app-worker.ts).
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "precache" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => { try { return new URL(u, self.location.origin).origin === self.location.origin; } catch { return false; } }).slice(0, 80);
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {}))))));
});

// ---- Push notifications. Payload (JSON): { title, body, url, tag, kind, icon? }. ----
function resolveUrl(url) {
  const fallback = self.location.origin + "/";
  if (!url) return fallback;
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin ? u.href : fallback; // never open a foreign site from a payload
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "EasAlpha", body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "EasAlpha";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || payload.kind || undefined,
    renotify: !!payload.tag,
    data: { url: resolveUrl(payload.url), kind: payload.kind || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const target = new URL(url);
      const same = list.find((c) => { try { return new URL(c.url).pathname === target.pathname; } catch { return false; } });
      if (same) return same.focus().then((c) => (c && "navigate" in c && c.url !== url ? c.navigate(url) : c));
      const any = list[0];
      if (any && "navigate" in any) return any.focus().then((c) => c.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
