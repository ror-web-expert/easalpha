"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bike, Check, ChefHat, KeyRound, Megaphone, Monitor, Tablet, Users, Utensils, ClipboardCheck } from "lucide-react";
import { api, errorMessage, type RequestOptions } from "@/lib/api";
import type { Branch, Device, PairedDevice, Session, SetupStaff } from "@/lib/types";
import { useDeviceStore } from "@/store/device";
import { useRiderStore } from "@/components/rider/store";
import { clearTillData } from "@/store/catalog";
import { confirmDiscardUnsynced } from "@/lib/sync";
import { Button, Field, Input, Loading, Select, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  canSetUpDevices, defaultDeviceName, existingScreen, ROLE_OPTIONS, roleOption, SCREEN_CHOICE_KEY, sortStaffForSetup, validPin, type DeviceRole,
} from "@/components/setup/setup-helpers";

/**
 * "Set up this device": one app for every machine. The owner or manager signs in once on the machine itself, picks
 * what it is (till, tablet, kitchen display, token or queue screen, rider phone) and the machine is created and paired
 * in one call. The manager's login lives only in this page's memory and is dropped when the device opens its screen;
 * the machine keeps just its device token. A browser that is already set up is forwarded straight to its screen, so
 * the desktop app and every installed home-screen icon can open /setup every time. "?again=1" re-runs the setup.
 */
const ICONS: Record<DeviceRole, React.ComponentType<{ className?: string }>> = { till: Monitor, tablet: Tablet, kitchen: ChefHat, token: Megaphone, queue: Users, rider: Bike, canteen: Utensils, counter: ClipboardCheck };
type Step = "checking" | "login" | "choose" | "ready";

const readScreenChoice = () => { try { return localStorage.getItem(SCREEN_CHOICE_KEY); } catch { return null; } };
const writeScreenChoice = (screen: string) => { try { localStorage.setItem(SCREEN_CHOICE_KEY, screen); } catch {} };

function Flow() {
  const router = useRouter();
  const again = useSearchParams().get("again") === "1";
  const dHydrated = useDeviceStore((s) => s.hydrated);
  const deviceToken = useDeviceStore((s) => s.deviceToken);
  const deviceKind = useDeviceStore((s) => s.device?.kind ?? null);
  const deviceName = useDeviceStore((s) => s.device?.name ?? null);
  const rHydrated = useRiderStore((s) => s.hydrated);
  const riderToken = useRiderStore((s) => s.deviceToken);
  useEffect(() => { useRiderStore.persist.rehydrate(); }, []);

  const [step, setStep] = useState<Step>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [branchId, setBranchId] = useState("");
  const [role, setRole] = useState<DeviceRole>("till");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [result, setResult] = useState<(PairedDevice & { staff: SetupStaff[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A browser that is already set up goes straight to its screen.
  useEffect(() => {
    if (!dHydrated || !rHydrated || step !== "checking") return;
    const target = again ? null : existingScreen({ deviceKind: deviceToken ? deviceKind : null, riderPaired: !!riderToken, screenChoice: readScreenChoice() });
    if (target) router.replace(target); else setStep("login");
  }, [dHydrated, rHydrated, step, again, deviceToken, deviceKind, riderToken, router]);

  const admin = useCallback(<T,>(path: string, opts: RequestOptions = {}) => api<T>(path, { ...opts, auth: "none", headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ""}` } }), [session]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const s = await api<Session>("/auth/login", { method: "POST", auth: "none", body: { email, password, app: "admin" } });
      if (!canSetUpDevices(s.permissions)) { setError("Only an owner or a manager can set up a device. Ask them to sign in here."); return; }
      const h = { Authorization: `Bearer ${s.access_token}` };
      const [b, d] = await Promise.all([
        api<{ data: Branch[] }>("/branches", { auth: "none", headers: h }),
        api<{ data: Device[] }>("/devices", { auth: "none", headers: h }),
      ]);
      setSession(s); setBranches(b.data); setDevices(d.data);
      setBranchId(s.branch?.id ?? b.data[0]?.id ?? "");
      setPassword("");
      setStep("choose");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const suggestedName = useMemo(() => defaultDeviceName(role, devices.filter((d) => d.branch_id === branchId)), [role, devices, branchId]);
  useEffect(() => { if (!nameEdited) setName(suggestedName); }, [suggestedName, nameEdited]);

  const register = async () => {
    const opt = roleOption(role);
    setBusy(true); setError(null);
    try {
      const r = await admin<PairedDevice & { staff: SetupStaff[] }>("/devices/register", {
        method: "POST",
        body: { name: name.trim() || suggestedName, kind: opt.kind, branch_id: branchId, platform: typeof window !== "undefined" && "easalphaDesktop" in window ? "desktop" : "web", app_version: "web" },
      });
      setResult(r);
      setStep("ready");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const open = async () => {
    if (!result) return;
    const opt = roleOption(role);
    const payload: PairedDevice = { device_token: result.device_token, device: result.device, business: result.business, branch: result.branch };
    if (opt.store === "rider") useRiderStore.getState().pair(payload);
    else {
      if (!(await confirmDiscardUnsynced())) return;
      await clearTillData();
      useDeviceStore.getState().pair(payload);
    }
    writeScreenChoice(opt.screen);
    setSession(null);
    router.replace(opt.screen);
  };

  if (step === "checking") return <Loading />;
  const opt = roleOption(role);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="flex items-center gap-3">
        <Image src="/brand/logo.svg" alt="EasAlpha" width={120} height={30} priority unoptimized className="h-8 w-auto dark:hidden" />
        <Image src="/brand/logo-white.svg" alt="" width={120} height={30} priority unoptimized className="hidden h-8 w-auto dark:block" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold">Set up this device</h1>
      <Steps step={step} />

      {step === "login" ? (
        <form onSubmit={login} className="mt-6 space-y-4 rounded-xl border bg-card p-6 shadow-[var(--shadow-card)]">
          <p className="text-sm text-fg-secondary">
            Sign in once as the owner or a manager. Your login is used only to set this machine up and is not kept on it.
            {deviceToken && deviceName ? <> This browser is currently <b>{deviceName}</b>; setting it up again replaces that.</> : null}
          </p>
          <Field label="Email"><Input type="email" aria-label="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Field label="Password"><Input type="password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
          <p className="text-center text-xs text-fg-muted">
            Have a 6-digit pairing code instead? <Link href="/pos/pair" className="text-primary">Pair a till</Link> or <Link href="/rider/pair" className="text-primary">a rider phone</Link>.
          </p>
        </form>
      ) : null}

      {step === "choose" && session ? (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-fg-secondary">Signed in as <b>{session.user.name}</b> at <b>{session.business.name}</b>. <button type="button" className="text-primary" onClick={() => { setSession(null); setStep("login"); }}>Not you?</button></p>
          <div>
            <div className="mb-2 text-sm font-medium">What is this machine?</div>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Device role">
              {ROLE_OPTIONS.map((o) => {
                const Icon = ICONS[o.role];
                const selected = o.role === role;
                return (
                  <button key={o.role} type="button" role="radio" aria-checked={selected} onClick={() => setRole(o.role)}
                    className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition", selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60")}>
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", selected ? "bg-primary text-primary-fg" : "bg-muted text-fg-secondary")}><Icon className="h-5 w-5" /></span>
                    <span>
                      <span className="block font-semibold">{o.title}</span>
                      <span className="mt-0.5 block text-xs text-fg-secondary">{o.text}</span>
                    </span>
                    {selected ? <Check className="ml-auto h-5 w-5 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {branches.length > 1 ? (
              <Field label="Branch"><Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            ) : null}
            <Field label="Name of this device" hint="Shown in Admin › Devices and on receipts.">
              <Input aria-label="Name of this device" value={name} onChange={(e) => { setName(e.target.value); setNameEdited(true); }} />
            </Field>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button size="lg" className="w-full" onClick={register} loading={busy} disabled={!branchId}>Set up as {opt.title}</Button>
        </div>
      ) : null}

      {step === "ready" && result ? (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-success bg-success-soft p-4">
            <div className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-success" /> This machine is now <span>{result.device.name}</span></div>
            <p className="mt-1 text-sm text-fg-secondary">{opt.title} · {result.branch.name} · code {result.device.code}. It opens this screen every time from now on. A manager can change this from the EasAlpha menu or by opening /setup?again=1.</p>
          </div>
          {opt.login ? <StaffList staff={result.staff} onSetPin={(id, pin) => admin<unknown>(`/staff/${id}/set_pin`, { method: "POST", body: { pin } })} onChanged={(id) => setResult((r) => r && { ...r, staff: r.staff.map((s) => (s.id === id ? { ...s, has_pin: true, pin_locked: false } : s)) })} /> : (
            <p className="text-sm text-fg-secondary">Nobody signs in on this screen; it shows orders as the kitchen and the till update them.</p>
          )}
          <Button size="lg" className="w-full" onClick={open}>Open the {opt.title.toLowerCase()}</Button>
        </div>
      ) : null}
    </main>
  );
}

function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [{ key: "login", label: "Sign in" }, { key: "choose", label: "Choose the role" }, { key: "ready", label: "Ready" }];
  const idx = items.findIndex((i) => i.key === step);
  return (
    <ol className="mt-2 flex gap-4 text-xs text-fg-muted" aria-label="Setup steps">
      {items.map((i, n) => <li key={i.key} className={cn("flex items-center gap-1.5", n <= idx && "text-primary")}><span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[11px]", n <= idx ? "border-primary bg-primary text-primary-fg" : "")}>{n + 1}</span>{i.label}</li>)}
    </ol>
  );
}

/** The people who can sign in on this device, those without a PIN first, with a one-line "Set PIN" per person. */
function StaffList({ staff, onSetPin, onChanged }: { staff: SetupStaff[]; onSetPin: (id: string, pin: string) => Promise<unknown>; onChanged: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = sortStaffForSetup(staff);
  const save = async (id: string) => {
    if (!validPin(pin)) { setError("A PIN is 4 digits."); return; }
    setBusy(true); setError(null);
    try { await onSetPin(id, pin); onChanged(id); setEditing(null); setPin(""); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 font-medium"><KeyRound className="h-4 w-4 text-primary" /> Who can sign in here <span className="ml-auto text-xs font-normal text-fg-muted">{rows.filter((s) => s.has_pin).length} of {rows.length} have a PIN</span></div>
      {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-fg-secondary">Nobody yet. Add staff under Admin › People and give them this branch.</p> : null}
      <ul className="divide-y">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1"><span className="font-medium">{s.name ?? "Unnamed"}</span> <span className="text-fg-muted">· {s.role}</span></span>
            {editing === s.id ? (
              <span className="flex items-center gap-2">
                <Input inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 digits" className="w-24" aria-label={`New PIN for ${s.name ?? "staff"}`} />
                <Button size="sm" onClick={() => save(s.id)} loading={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setPin(""); setError(null); }}>Cancel</Button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs", s.pin_locked ? "bg-danger-soft text-danger" : s.has_pin ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{s.pin_locked ? "PIN locked" : s.has_pin ? "PIN set" : "No PIN"}</span>
                <Button size="sm" variant="secondary" onClick={() => { setEditing(s.id); setPin(""); setError(null); }}>{s.has_pin ? "Reset PIN" : "Set PIN"}</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="px-4 pb-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<Loading />}><Flow /></Suspense>;
}
