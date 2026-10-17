"use client";
// Registers the service worker (public/sw.js) for the rider app and the restaurant apps, and hands it the scripts and
// styles this page loaded so the next visit opens with no signal. Production only, as for the till.

export function registerAppWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = performance.getEntriesByType("resource").map((e) => e.name)
      .filter((u) => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith("/_next/static/"); } catch { return false; } });
    reg.active?.postMessage({ type: "precache", urls: [...urls, location.pathname] });
  }).catch(() => {});
}
