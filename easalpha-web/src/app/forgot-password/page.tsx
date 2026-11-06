"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Session } from "@/lib/types";
import { Button, Field, Input, ThemeToggle } from "@/components/ui";

// QA of 6 Nov 2026, P8: a forgotten password had no way back but a phone code. A code by email resets it: the page says
// the same whether or not the email has a login (so does the API), the code lasts 15 minutes, and the new password
// signs every other session of the login out.
function ForgotPassword() {
  const router = useRouter();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ sent: boolean; dev_code?: string }>("/auth/password/forgot", { method: "POST", body: { email }, auth: "none" });
      setSent(true);
      if (r.dev_code) setCode(r.dev_code);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/auth/password/reset", { method: "POST", body: { email, code, password }, auth: "none" });
      // Straight into the admin with the new password; a login without admin access is told to sign in where it works.
      try {
        const s = await api<Session>("/auth/login", { method: "POST", body: { email, password, app: "admin" }, auth: "none" });
        qc.clear(); setSession(s); router.replace("/admin");
      } catch { setDone(true); }
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-[360px] rounded-[28px] bg-card p-8 shadow-[var(--elev-1)]">
        <Link href="/" className="mb-8 flex items-center" aria-label="EasAlpha home">
          <Image src="/brand/logo.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto dark:hidden" />
          <Image src="/brand/logo-white.svg" alt="" width={150} height={37} priority unoptimized className="hidden h-9 w-auto dark:block" />
        </Link>
        <h1 className="text-[28px] leading-9">Reset your password</h1>
        {done ? (
          <p className="mt-4 text-sm text-fg-secondary">Your password is changed. This login does not open the admin panel: sign in where you work, such as the till with your PIN.</p>
        ) : !sent ? (
          <form onSubmit={request} className="mt-6 space-y-4">
            <p className="text-sm text-fg-secondary">Enter the email you log in with. We send a code to it.</p>
            <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-12" /></Field>
            {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
            <Button type="submit" className="w-full" loading={busy}>Send code</Button>
          </form>
        ) : (
          <form onSubmit={reset} className="mt-6 space-y-4">
            {/* The API answers the same with or without a login, so the page cannot say more than this. */}
            <p className="text-sm text-fg-secondary">If {email} has an EasAlpha login, a code is on its way. It works for 15 minutes.</p>
            <Field label="Code"><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required className="h-11 text-center text-lg tracking-[0.5em]" /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" /></Field>
            {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
            <Button type="submit" className="w-full" loading={busy}>Set new password</Button>
            <Button type="button" variant="link" className="w-full" onClick={() => { setSent(false); setCode(""); }}>Use a different email</Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-fg-secondary"><Link href="/login" className="font-medium text-primary hover:underline">Back to log in</Link></p>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense><ForgotPassword /></Suspense>;
}
