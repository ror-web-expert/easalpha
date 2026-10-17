"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bike } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Branch, Business, Device } from "@/lib/types";
import { riderApi } from "@/components/rider/api";
import { useRiderStore } from "@/components/rider/store";
import { Button, Keypad, ThemeToggle } from "@/components/ui";
import { InstallAppCard } from "@/components/install-app";

export default function RiderPairPage() {
  const router = useRouter();
  const pair = useRiderStore((s) => s.pair);
  const device = useRiderStore((s) => s.device);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(async (value: string) => {
    if (value.length < 6) return;
    setBusy(true); setError(null);
    try {
      const r = await riderApi<{ device_token: string; device: Device; business: Business; branch: Branch }>("/devices/pair", { method: "POST", token: "device", body: { pairing_code: value, platform: "web-rider", app_version: "web" } });
      if (r.device.kind !== "rider") { setError("This code belongs to a till, not a rider phone. Ask for a rider phone code."); setCode(""); return; }
      pair(r);
      router.replace("/rider/pin");
    } catch (e) { setError(errorMessage(e)); setCode(""); }
    finally { setBusy(false); }
  }, [pair, router]);
  // The QR on Admin, Riders, Rider App opens /rider/pair?code=123456: fill it in and pair at once, then drop the code
  // from the address so it is not kept in the browser history of an installed app.
  const fromLink = useRef(false);
  useEffect(() => {
    if (fromLink.current) return;
    fromLink.current = true;
    const linked = new URLSearchParams(window.location.search).get("code")?.replace(/\D/g, "").slice(0, 6) ?? "";
    if (linked.length === 6) { window.history.replaceState(null, "", "/rider/pair"); setCode(linked); void submit(linked); }
  }, [submit]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-cta text-cta-fg"><Bike className="h-7 w-7" /></span>
          <h1 className="mt-4 text-2xl font-semibold">Pair this phone</h1>
          <p className="mt-1 text-fg-secondary">Enter the 6-digit code from Admin, Riders, Rider App, or <Link href="/setup" className="text-primary">set it up with a manager login</Link>.</p>
          {device ? <p className="mt-1 text-xs text-fg-muted">This phone was {device.name}; pairing again replaces it.</p> : null}
        </div>
        <div className="flex justify-center gap-2" aria-label="Pairing code">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="grid h-14 w-11 place-items-center rounded-lg border bg-card font-mono text-2xl font-bold">{code[i] ?? ""}</span>
          ))}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad large onKey={(d) => setCode((c) => (c.length < 6 ? c + d : c))} onBackspace={() => setCode((c) => c.slice(0, -1))} onClear={() => setCode("")} />
        <Button size="xl" className="w-full" onClick={() => submit(code)} loading={busy} disabled={code.length < 6}>Pair</Button>
        <InstallAppCard appName="the rider app" text="Add it to the home screen so it opens like an app." className="text-left" />
      </div>
    </main>
  );
}
