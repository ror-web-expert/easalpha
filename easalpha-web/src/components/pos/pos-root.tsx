"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDeviceStore } from "@/store/device";
import { useCartStore } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useCustomerStore } from "@/store/customers";
import { startSync, pullChanges } from "@/lib/sync";
import { loadCurrentShift, pruneOldOrders } from "@/lib/pos-actions";
import { Loading } from "@/components/ui";

/** Client side of the till: service worker, route guards, sync, the inactivity lock and the touch-screen rules. */
export function PosRoot({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useDeviceStore((s) => s.hydrated);
  const deviceToken = useDeviceStore((s) => s.deviceToken);
  const session = useDeviceStore((s) => s.session);
  const lockMinutes = useDeviceStore((s) => s.lockMinutes);
  const lock = useDeviceStore((s) => s.lock);
  const touch = useDeviceStore((s) => s.touch);
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const lastActivity = useRef(Date.now());

  // Touch screens: the page itself never scrolls, bounces or reloads under a finger (globals.css, touch-ui).
  useEffect(() => {
    document.documentElement.classList.add("touch-ui-root");
    return () => document.documentElement.classList.remove("touch-ui-root");
  }, []);

  // Service worker for the installable till
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    useCartStore.persist.rehydrate();
    useCatalogStore.getState().loadLocal();
    useCustomerStore.getState().load();
  }, []);

  // Route guards
  useEffect(() => {
    if (!hydrated) return;
    if (!deviceToken && pathname !== "/pos/pair") router.replace("/pos/pair");
    else if (deviceToken && !session && pathname !== "/pos/pin" && pathname !== "/pos/pair") router.replace("/pos/pin");
  }, [hydrated, deviceToken, session, pathname, router]);

  // Sync engine + catalog refresh once logged in
  useEffect(() => {
    if (!session) return;
    const stop = startSync();
    const cs = useCatalogStore.getState();
    (cs.catalog ? pullChanges() : cs.refresh().catch(() => {})).then(() => loadCurrentShift());
    // The offline customer search needs the whole list once (a till paired before it existed has none yet).
    void useCustomerStore.getState().downloadIfStale();
    pruneOldOrders();
    return stop;
  }, [session]);

  // Inactivity lock
  useEffect(() => {
    if (!session) return;
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump));
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > lockMinutes * 60_000) { lock(); router.replace("/pos/pin"); }
    }, 10_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [session, lockMinutes, lock, router, touch]);

  // The root is exactly the visible screen (dvh leaves out the browser's address bar) and scrolls itself only when a
  // page is taller, such as the PIN pad on a short landscape tablet; the page behind never moves.
  if (!hydrated || (session && !catalogLoaded)) return <div className="till touch-ui h-dvh overflow-y-auto overscroll-none bg-page"><Loading /></div>;
  return <div className="till touch-ui h-dvh overflow-y-auto overscroll-none bg-page text-fg">{children}</div>;
}
