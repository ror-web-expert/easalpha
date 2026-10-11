"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDeviceStore } from "@/store/device";
import { useCartStore } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { startSync, pullChanges } from "@/lib/sync";
import { loadCurrentShift, pruneOldOrders } from "@/lib/pos-actions";
import { Loading } from "@/components/ui";

export default function PosLayout({ children }: { children: React.ReactNode }) {
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

  // Service worker for the installable till
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    useCartStore.persist.rehydrate();
    useCatalogStore.getState().loadLocal();
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

  if (!hydrated || (session && !catalogLoaded)) return <div className="till min-h-screen bg-page"><Loading /></div>;
  return <div className="till min-h-screen bg-page text-fg">{children}</div>;
}
