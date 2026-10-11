"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api, errorMessage } from "@/lib/api";
import { useSuperStore } from "@/store/super";
import type { SuperLogin } from "@/lib/types";
import { Button, Field, Input } from "@/components/ui";

export default function SuperLoginPage() {
  const router = useRouter();
  const hydrated = useSuperStore((s) => s.hydrated);
  const token = useSuperStore((s) => s.token);
  const setLogin = useSuperStore((s) => s.setLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (hydrated && token) router.replace("/super"); }, [hydrated, token, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<SuperLogin>("/super/login", { method: "POST", body: { email, password }, auth: "none" });
      setLogin(r.access_token, r.admin);
      router.replace("/super");
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen flex-col bg-navy-deep">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2.5 px-4 text-white">
        <Image src="/brand/logo-white.svg" alt="EasAlpha" width={96} height={24} priority unoptimized className="h-6 w-auto" />
        <span className="text-sm text-white/60" aria-hidden="true">·</span>
        <span className="text-sm font-medium text-white/85">Owner panel</span>
      </div>
      <section className="flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:items-center sm:pt-0">
        <form onSubmit={submit} className="w-full max-w-[360px] space-y-4 rounded-[28px] bg-card p-8 shadow-[var(--shadow-pop)]">
          <div>
            <h1 className="text-[22px] leading-7 text-heading">EasAlpha team login</h1>
            <p className="mt-1 text-sm text-fg-secondary">For EasAlpha staff only. Restaurant owners log in at <a className="font-medium text-primary hover:underline" href="/login">/login</a>.</p>
          </div>
          <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="h-12" /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" /></Field>
          {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy}>Log in</Button>
        </form>
      </section>
    </main>
  );
}
