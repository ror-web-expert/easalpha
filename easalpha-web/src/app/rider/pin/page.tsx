"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Unplug } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Session } from "@/lib/types";
import { riderApi } from "@/components/rider/api";
import { useRiderStore } from "@/components/rider/store";
import { Button, Keypad, PinDots, ThemeToggle } from "@/components/ui";
import { InstallAppCard } from "@/components/install-app";

export default function RiderPinPage() {
  const router = useRouter();
  const device = useRiderStore((s) => s.device);
  const branch = useRiderStore((s) => s.branch);
  const business = useRiderStore((s) => s.business);
  const setSession = useRiderStore((s) => s.setSession);
  const unpair = useRiderStore((s) => s.unpair);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(async (p: string) => {
    setBusy(true); setError(null);
    try {
      const s = await riderApi<Session>("/devices/pin_login", { method: "POST", token: "device", body: { pin: p } });
      if (s.app !== "rider") { setError("This PIN belongs to a till user. Sign in with a rider's PIN."); setPin(""); return; }
      setSession(s);
      router.replace("/rider");
    } catch (e) { setError(errorMessage(e)); setPin(""); }
    finally { setBusy(false); }
  }, [router, setSession]);
  useEffect(() => { if (pin.length === 4 && !busy) submit(pin); }, [pin, busy, submit]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="text-sm text-fg-secondary">{business?.name}</div>
          <h1 className="text-2xl font-semibold">{branch?.name ?? "Rider app"}</h1>
          <p className="mt-1 text-sm text-fg-muted">{device?.name} · {device?.code}</p>
        </div>
        <p className="text-fg-secondary">Enter your 4-digit rider PIN</p>
        <PinDots length={4} filled={pin.length} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad large onKey={(d) => setPin((p) => (p.length < 4 ? p + d : p))} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin("")} />
        <InstallAppCard appName="the rider app" text="Add it to the home screen so it opens like an app." className="text-left" />
        <Button variant="ghost" size="sm" className="text-fg-muted" onClick={() => { if (confirm("Unpair this phone? You will need a new code from the admin.")) { unpair(); router.replace("/rider/pair"); } }}><Unplug className="h-4 w-4" /> Unpair phone</Button>
      </div>
    </main>
  );
}
