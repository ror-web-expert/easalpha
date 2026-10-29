"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { useDeviceStore } from "@/store/device";
import type { Session } from "@/lib/types";
import { Button, Keypad, PinDots, ThemeToggle } from "@/components/ui";
import { SyncBadge } from "@/components/pos/sync-badge";
import { useCatalogStore } from "@/store/catalog";
import { unsyncedCount } from "@/lib/sync";
import { Unplug } from "lucide-react";

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
  const submit = useCallback(async (p: string) => {
    setBusy(true); setError(null);
    try {
      const s = await api<Session>("/devices/pin_login", { method: "POST", auth: "device", body: { pin: p } });
      setSession(s);
      router.replace(s.app === "kitchen" ? "/kitchen" : "/pos");
    } catch (e) { setError(errorMessage(e)); setPin(""); }
    finally { setBusy(false); }
  }, [router, setSession]);
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
        <PinDots length={4} filled={pin.length} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
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
