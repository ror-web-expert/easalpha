"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRiderStore } from "./store";
import { Loading } from "@/components/ui";

/** Route guard for the rider app: no device token goes to /rider/pair, no PIN session goes to /rider/pin. */
export function RiderShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useRiderStore((s) => s.hydrated);
  const deviceToken = useRiderStore((s) => s.deviceToken);
  const session = useRiderStore((s) => s.session);
  useEffect(() => { useRiderStore.persist.rehydrate(); }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (!deviceToken && pathname !== "/rider/pair") router.replace("/rider/pair");
    else if (deviceToken && !session && pathname !== "/rider/pin" && pathname !== "/rider/pair") router.replace("/rider/pin");
    else if (deviceToken && session && (pathname === "/rider/pin" || pathname === "/rider/pair")) router.replace("/rider");
  }, [hydrated, deviceToken, session, pathname, router]);
  if (!hydrated) return <div className="min-h-screen bg-page"><Loading /></div>;
  return <div className="till mx-auto min-h-screen w-full max-w-md bg-page text-fg">{children}</div>;
}
