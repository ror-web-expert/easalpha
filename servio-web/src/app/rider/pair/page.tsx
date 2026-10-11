"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Branch, Business, Device } from "@/lib/types";
import { riderApi } from "@/components/rider/api";
import { useRiderStore } from "@/components/rider/store";
import { Button, Keypad, ThemeToggle } from "@/components/ui";

export default function RiderPairPage() {
  const router = useRouter();
  const pair = useRiderStore((s) => s.pair);
  const device = useRiderStore((s) => s.device);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (code.length < 6) return;
    setBusy(true); setError(null);
    try {
      const r = await riderApi<{ device_token: string; device: Device; business: Business; branch: Branch }>("/devices/pair", { method: "POST", token: "device", body: { pairing_code: code, platform: "web-rider", app_version: "web" } });
      if (r.device.kind !== "rider") { setError("This code belongs to a till, not a rider phone. Ask for a rider phone code."); setCode(""); return; }
      pair(r);
      router.replace("/rider/pin");
    } catch (e) { setError(errorMessage(e)); setCode(""); }
    finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-cta text-cta-fg"><Bike className="h-7 w-7" /></span>
          <h1 className="mt-4 text-2xl font-semibold">Pair this phone</h1>
          <p className="mt-1 text-fg-secondary">Enter the 6-digit code from Admin, Riders, Rider App.</p>
          {device ? <p className="mt-1 text-xs text-fg-muted">This phone was {device.name}; pairing again replaces it.</p> : null}
        </div>
        <div className="flex justify-center gap-2" aria-label="Pairing code">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="grid h-14 w-11 place-items-center rounded-lg border bg-card font-mono text-2xl font-bold">{code[i] ?? ""}</span>
          ))}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad large onKey={(d) => setCode((c) => (c.length < 6 ? c + d : c))} onBackspace={() => setCode((c) => c.slice(0, -1))} onClear={() => setCode("")} />
        <Button size="xl" className="w-full" onClick={submit} loading={busy} disabled={code.length < 6}>Pair</Button>
      </div>
    </main>
  );
}
