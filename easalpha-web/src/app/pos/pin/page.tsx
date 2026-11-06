"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useDeviceStore } from "@/store/device";
import { useSyncStore } from "@/store/sync";
import type { Session } from "@/lib/types";
import { Button, Keypad, PinDots, ThemeToggle } from "@/components/ui";
import { SyncBadge } from "@/components/pos/sync-badge";
import { useCatalogStore } from "@/store/catalog";
import { isOnline, noteNetworkFailure, probeHealth, unsyncedCount } from "@/lib/sync";
import { forgetStashesOpenedBy, noteWrongOfflinePin, offlineWaitMs, OFFLINE_WAIT_MS, resetOfflineTries, stashSession, unlockStash } from "@/lib/session-stash";
import { Unplug, WifiOff } from "lucide-react";

/** The server's answers that this PIN no longer opens a session here: a copy it still opens offline must go too. */
const PIN_REFUSED = ["pin.invalid", "app.denied"];

const waitText = (ms: number) => `Too many wrong PINs while offline. Try again in ${Math.ceil(ms / 1000)} s.`;

export default function PinPage() {
  const router = useRouter();
  const device = useDeviceStore((s) => s.device);
  const branch = useDeviceStore((s) => s.branch);
  const business = useDeviceStore((s) => s.business);
  const setSession = useDeviceStore((s) => s.setSession);
  const unpair = useDeviceStore((s) => s.unpair);
  const shift = useCatalogStore((s) => s.shift);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [waitMs, setWaitMs] = useState(() => offlineWaitMs());

  // The connection as it is now (K5): the sync engine stops while the till is locked, so its last word ("Online")
  // said nothing. The browser's flag first, then a 3 s health probe on arrival, on every change and every 15 s.
  useEffect(() => {
    let alive = true;
    const show = (ok: boolean) => {
      if (!alive) return;
      setOnline(ok);
      useSyncStore.getState().set({ status: ok ? "online" : "offline" });
    };
    const check = () => { if (!navigator.onLine) show(false); else void probeHealth().then(show); };
    const offline = () => show(false);
    check();
    window.addEventListener("online", check);
    window.addEventListener("offline", offline);
    const t = setInterval(check, 15_000);
    return () => { alive = false; window.removeEventListener("online", check); window.removeEventListener("offline", offline); clearInterval(t); };
  }, []);

  // The wait after five wrong PINs offline counts down on screen.
  const waiting = waitMs > 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setWaitMs(offlineWaitMs()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  // The PIN is cleared with it: left in place, the next render (busy over, the page not yet gone) sent it again.
  const enter = useCallback((s: Session) => {
    resetOfflineTries();
    setPin("");
    setSession(s);
    router.replace(s.app === "kitchen" ? "/kitchen" : "/pos");
  }, [router, setSession]);

  const submit = useCallback(async (p: string) => {
    setBusy(true); setError(null);
    try {
      if (isOnline()) {
        try {
          const s = await api<Session>("/devices/pin_login", { method: "POST", auth: "device", body: { pin: p }, timeoutMs: 8000 });
          // The copy that unlocks this till offline, for this member, under their PIN (K5).
          if (s.app === "pos" && device?.id) void stashSession(p, s, device.id).catch(() => {});
          enter(s);
          return;
        } catch (e) {
          if (!(e instanceof ApiError && e.isNetwork)) {
            if (e instanceof ApiError && PIN_REFUSED.includes(e.code) && device?.id) void forgetStashesOpenedBy(p, device.id).catch(() => {});
            throw e;
          }
          // No answer: the till is offline after all, and the copies below decide.
          noteNetworkFailure();
          setOnline(false);
          useSyncStore.getState().set({ status: "offline" });
        }
      }
      const wait = offlineWaitMs();
      if (wait) { setWaitMs(wait); setError(waitText(wait)); setPin(""); return; }
      const s = device?.id ? await unlockStash(p, device.id) : null;
      if (s) { enter(s); return; }
      const left = noteWrongOfflinePin();
      if (!left) setWaitMs(OFFLINE_WAIT_MS);
      setError(left ? `That PIN did not open a sign-in kept on this till. Offline, only staff who signed in here while online can unlock it. ${left} ${left === 1 ? "try" : "tries"} left.` : waitText(OFFLINE_WAIT_MS));
      setPin("");
    } catch (e) { setError(errorMessage(e)); setPin(""); }
    finally { setBusy(false); }
  }, [device?.id, enter]);
  useEffect(() => { if (pin.length === 4 && !busy) submit(pin); }, [pin, busy, submit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute left-4 top-4"><SyncBadge /></div>
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="text-sm text-fg-secondary">{business?.name}</div>
          <h1 className="text-2xl font-semibold">{branch?.name ?? "Till"}</h1>
          <p className="mt-1 text-sm text-fg-muted">{device?.name} · {device?.code}{shift ? " · shift open" : ""}</p>
        </div>
        <p className="text-fg-secondary">Enter your 4-digit PIN</p>
        {!online ? (
          <p role="status" className="flex items-center justify-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            <WifiOff className="h-4 w-4 shrink-0" /> Offline. Staff who signed in on this till while online can unlock it with their PIN.
          </p>
        ) : null}
        <PinDots length={4} filled={pin.length} />
        {waiting && !online ? <p className="text-sm text-danger">{waitText(waitMs)}</p> : error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad large onKey={(d) => setPin((p) => (p.length < 4 ? p + d : p))} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin("")} />
        <Button variant="ghost" size="sm" className="text-fg-muted" onClick={async () => {
          const n = await unsyncedCount();
          if (n) { alert(`${n} record${n === 1 ? "" : "s"} on this device ${n === 1 ? "has" : "have"} not reached the server yet. Wait for the sync, or check Needs attention, before unpairing.`); return; }
          if (confirm("Unpair this device?")) { unpair(); router.replace("/pos/pair"); }
        }}><Unplug className="h-4 w-4" /> Unpair device</Button>
      </div>
    </main>
  );
}
