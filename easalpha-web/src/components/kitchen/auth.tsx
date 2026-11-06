"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeviceStore } from "@/store/device";
import { useAuthStore } from "@/store/auth";
import { api, errorMessage } from "@/lib/api";
import type { Branch, Business, Device } from "@/lib/types";
import { Button, Keypad, Loading } from "@/components/ui";
import { clearTillData } from "@/store/catalog";
import { confirmDiscardUnsynced } from "@/lib/sync";

/** Devices whose own token names nobody: there the kitchen display needs someone signed in; the queue and token lists do not. */
export const TILL_DEVICE_KINDS = ["till", "tablet"];

/**
 * The kitchen and token screens accept a POS session, a paired device token or a logged-in admin user. A manager
 * logged in on this browser comes before a till or tablet's own token, which the API takes for the queue and token
 * lists only (final round, contracts#7); `tillOnly` says the screen holds nothing but that token.
 */
export function useKitchenToken(): { token: string | null; ready: boolean; kind: "device" | "user" | null; tillOnly: boolean } {
  const dh = useDeviceStore((s) => s.hydrated);
  const ah = useAuthStore((s) => s.hydrated);
  const posSession = useDeviceStore((s) => s.session);
  const deviceToken = useDeviceStore((s) => s.deviceToken);
  const tillDevice = useDeviceStore((s) => TILL_DEVICE_KINDS.includes(s.device?.kind ?? ""));
  const admin = useAuthStore((s) => s.session);
  const ready = dh && ah;
  if (!ready) return { token: null, ready: false, kind: null, tillOnly: false };
  if (posSession?.access_token) return { token: posSession.access_token, ready, kind: "device", tillOnly: false };
  if (admin?.access_token && (tillDevice || !deviceToken)) return { token: admin.access_token, ready, kind: "user", tillOnly: false };
  if (deviceToken) return { token: deviceToken, ready, kind: "device", tillOnly: tillDevice };
  return { token: null, ready, kind: null, tillOnly: false };
}

export function KitchenGate({ children, title }: { children: React.ReactNode; title: string }) {
  const { token, ready, tillOnly } = useKitchenToken();
  const pathname = usePathname();
  const router = useRouter();
  const pair = useDeviceStore((s) => s.pair);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
    return () => { if (prev) document.documentElement.setAttribute("data-theme", prev); else document.documentElement.removeAttribute("data-theme"); };
  }, []);
  if (!ready) return <Loading />;
  // The kitchen display on a till or tablet with nobody signed in: the API answers session.required, so say who can
  // open it rather than show a board that never loads (the queue and token screens work on the till's token).
  if (token && tillOnly && (pathname === "/kitchen" || pathname?.startsWith("/kitchen/"))) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-page px-4 text-fg">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-fg-secondary">This screen is a till. Sign in on the till with your PIN to open the kitchen display, or <Link href="/login" className="text-primary">log in</Link> as a manager.</p>
          <Button size="xl" className="w-full" onClick={() => router.push("/pos/pin")}>Sign in with a PIN</Button>
        </div>
      </main>
    );
  }
  if (token) return <>{children}</>;
  const submit = async () => {
    if (!(await confirmDiscardUnsynced())) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ device_token: string; device: Device; business: Business; branch: Branch }>("/devices/pair", { method: "POST", auth: "none", body: { pairing_code: code, platform: "web", app_version: "web" } });
      await clearTillData();
      pair(r);
    } catch (e) { setError(errorMessage(e)); setCode(""); }
    finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-page px-4 text-fg">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-fg-secondary"><Link href="/setup" className="text-primary">Set this screen up with a manager login</Link>, pair it with the 6-digit code from Admin › Devices (kind: kitchen or token screen), or <Link href="/login" className="text-primary">log in</Link> as a manager.</p>
        <div className="flex justify-center gap-2">{Array.from({ length: 6 }).map((_, i) => <span key={i} className="grid h-14 w-11 place-items-center rounded-lg border bg-card font-mono text-2xl font-bold">{code[i] ?? ""}</span>)}</div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Keypad onKey={(d) => setCode((c) => (c.length < 6 ? c + d : c))} onBackspace={() => setCode((c) => c.slice(0, -1))} onClear={() => setCode("")} />
        <Button size="xl" className="w-full" onClick={submit} loading={busy} disabled={code.length < 6}>Pair</Button>
      </div>
    </main>
  );
}

/** Short beep patterns via WebAudio. The context is created on the first tap, as browsers require. */
export function useBeep() {
  const [ctx, setCtx] = useState<AudioContext | null>(null);
  useEffect(() => {
    const unlock = () => { try { setCtx((c) => c ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()); } catch {} };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  return useCallback((pattern: number[] = [880, 1100]) => {
    if (!ctx) return;
    try {
      pattern.forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f; g.gain.value = 0.15;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.15);
      });
    } catch {}
  }, [ctx]);
}
