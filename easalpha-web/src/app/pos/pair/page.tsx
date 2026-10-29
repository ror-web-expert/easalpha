"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, errorMessage } from "@/lib/api";
import { useDeviceStore } from "@/store/device";
import type { Branch, Business, Device } from "@/lib/types";
import { Button, Keypad, ThemeToggle } from "@/components/ui";
import { clearTillData } from "@/store/catalog";
import { confirmDiscardUnsynced } from "@/lib/sync";

export default function PairPage() {
  const router = useRouter();
  const pair = useDeviceStore((s) => s.pair);
  const device = useDeviceStore((s) => s.device);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (code.length < 6) return;
    if (!(await confirmDiscardUnsynced())) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ device_token: string; device: Device; business: Business; branch: Branch }>("/devices/pair", { method: "POST", auth: "none", body: { pairing_code: code, platform: "web", app_version: "web" } });
      await clearTillData();
      pair(r);
      router.replace("/pos/pin");
    } catch (e) { setError(errorMessage(e)); setCode(""); }
    finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-primary text-2xl font-bold text-primary-fg">S</span>
          <h1 className="mt-4 text-2xl font-semibold">Pair this till</h1>
          <p className="mt-1 text-fg-secondary">Enter the 6-digit code from Admin › Devices, or <Link href="/setup" className="text-primary">set it up with a manager login</Link>.</p>
          {device ? <p className="mt-1 text-xs text-fg-muted">This device was {device.name}; pairing again replaces it.</p> : null}
        </div>
        <div className="flex justify-center gap-2" aria-label="Pairing code">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="grid h-14 w-11 place-items-center rounded-lg border bg-card font-mono text-2xl font-bold">{code[i] ?? ""}</span>
          ))}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad onKey={(d) => setCode((c) => (c.length < 6 ? c + d : c))} onBackspace={() => setCode((c) => c.slice(0, -1))} onClear={() => setCode("")} />
        <Button size="xl" className="w-full" onClick={submit} loading={busy} disabled={code.length < 6}>Pair</Button>
      </div>
    </main>
  );
}
