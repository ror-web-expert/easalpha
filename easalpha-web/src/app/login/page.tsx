"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { api, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Session } from "@/lib/types";
import { Button, Field, Input, Tabs, ThemeToggle } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+92");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (hydrated && session) router.replace("/admin"); }, [hydrated, session, router]);

  const finish = (s: Session) => { setSession(s); router.replace("/admin"); };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { finish(await api<Session>("/auth/login", { method: "POST", body: { email, password, app: "admin" }, auth: "none" })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ sent: boolean; phone: string; dev_code?: string }>("/auth/otp/request", { method: "POST", body: { phone, purpose: "login" }, auth: "none" });
      setSent(r.phone);
      if (r.dev_code) setCode(r.dev_code);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { finish(await api<Session>("/auth/otp/verify", { method: "POST", body: { phone, code, app: "admin" }, auth: "none" })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy-deep p-12 text-white lg:flex lg:flex-col [--heading-color:#fff]">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-cta/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
        <Link href="/" className="relative flex items-center" aria-label="EasAlpha home">
          <Image src="/brand/logo-white.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto" />
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-[44px] text-white">Run every counter, kitchen and branch from one place.</h2>
          <p className="mt-4 text-base leading-6 tracking-[0.5px] text-white/75">Orders, stock, suppliers, staff and reports for Pakistani restaurants. Tills keep selling when the internet drops.</p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[["Offline", "till sales sync later"], ["FBR", "tax invoices"], ["Urdu", "receipts and screens"]].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-white/[0.08] p-4">
                <div className="text-base font-medium">{a}</div>
                <div className="mt-0.5 text-xs tracking-[0.4px] text-white/70">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-4 py-12">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-[360px] rounded-[28px] bg-card p-8 shadow-[var(--elev-1)] lg:shadow-none">
          <Link href="/" className="mb-8 flex items-center lg:hidden" aria-label="EasAlpha home">
            <Image src="/brand/logo.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto" />
          </Link>
          <h1 className="text-[28px] leading-9">Welcome back</h1>
          <p className="mt-1 text-sm text-fg-secondary">Log in to the admin panel.</p>
          <Tabs value={mode} onChange={(m) => { setMode(m); setError(null); }} items={[{ value: "password", label: "Email" }, { value: "otp", label: "Phone (OTP)" }]} className="mb-6 mt-6 w-full" />
          {mode === "password" ? (
            <form onSubmit={login} className="space-y-4">
              <Field label="Email"><Input type="email" autoComplete="email" placeholder="you@restaurant.pk" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-12" /></Field>
              <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" /></Field>
              {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
              <Button type="submit" className="w-full" loading={busy}>Log in</Button>
            </form>
          ) : sent ? (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-fg-secondary">We sent a code by WhatsApp to {sent}.</p>
              <Field label="Code"><Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus className="h-11 text-center text-lg tracking-[0.5em]" /></Field>
              {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
              <Button type="submit" className="w-full" loading={busy}>Verify</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setSent(null)}>Use a different number</Button>
            </form>
          ) : (
            <form onSubmit={requestOtp} className="space-y-4">
              <Field label="Phone" hint="International format, e.g. +923001234567"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus className="h-12" /></Field>
              {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
              <Button type="submit" className="w-full" loading={busy}>Send code</Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-fg-secondary">New to EasAlpha? <Link href="/signup" className="font-medium text-primary hover:underline">Create your account</Link></p>
          <p className="mt-6 border-t pt-5 text-xs tracking-[0.4px] text-fg-secondary">Till staff: open <a className="font-medium text-primary hover:underline" href="/pos">/pos</a> on the paired device and log in with your PIN.</p>
        </div>
      </section>
    </main>
  );
}
