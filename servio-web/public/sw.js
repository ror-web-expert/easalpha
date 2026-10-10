/* Servio service worker: caches the app shell so /pos, /kitchen and /token open offline (data lives in IndexedDB) and
   shows browser push notifications for the admin, till, kitchen and rider apps, even while no tab is open. */
const VERSION = "servio-shell-v2";
const SHELL = ["/pos", "/pos/pin", "/pos/orders", "/pos/shift", "/pos/attention", "/kitchen", "/token", "/manifest.json", "/icon.svg"];

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
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/pos"))),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".png") || url.pathname.endsWith(".json")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
  }
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
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "Servio", body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "Servio";
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
