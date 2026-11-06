"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { inviteNext } from "@/lib/account-flows";
import { useAuthStore } from "@/store/auth";
import type { Session } from "@/lib/types";
import { Button, Field, Input, Loading, ThemeToggle } from "@/components/ui";

// A staff invitation (QA of 6 Nov 2026, P1): an owner added someone by a phone or email that is on an EasAlpha login
// which never confirmed it, so nothing was linked. The link names the invitation; the code we send to that phone or
// email proves the person, who then joins with the login it is on (by that login's password) or with a new one.

interface Summary { business: { name: string; logo_key: string | null }; role: string; name: string; proof: "phone" | "email"; to: string; status: "pending" | "accepted" | "cancelled" | "expired"; expires_at: string }
type Accepted = (Session & { joined: true }) | { joined: true; message: string; business: { name: string }; role: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const info = useQuery({ queryKey: ["invitation", token], queryFn: () => api<Summary>(`/invitations/${encodeURIComponent(token)}`, { auth: "none" }), enabled: !!token, retry: false });
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [choose, setChoose] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ sent: boolean; dev_code?: string }>(`/invitations/${encodeURIComponent(token)}/code`, { method: "POST", auth: "none" });
      setSent(true);
      if (r.dev_code) setCode(r.dev_code);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const accept = async (extra: { password?: string; new_login?: boolean; new_password?: string } = {}) => {
    setBusy(true); setError(null);
    try {
      const r = await api<Accepted>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST", body: { code, ...extra }, auth: "none" });
      if ("access_token" in r) { qc.clear(); setSession(r); router.replace("/admin"); return; }
      setJoined(r.message);
    } catch (e) {
      const next = inviteNext(e);
      if (next.kind === "choose") setChoose(true);
      else if (next.kind === "closed") setClosed(next.message);
      else setError(next.message);
    } finally { setBusy(false); }
  };

  const s = info.data;
  const missing = info.error instanceof ApiError && info.error.status === 404;
  const via = s?.proof === "phone" ? "by WhatsApp" : "by email";
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <meta name="robots" content="noindex, nofollow" />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-[400px] rounded-[28px] bg-card p-8 shadow-[var(--elev-1)]">
        <Link href="/" className="mb-8 flex items-center" aria-label="EasAlpha home">
          <Image src="/brand/logo.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto dark:hidden" />
          <Image src="/brand/logo-white.svg" alt="" width={150} height={37} priority unoptimized className="hidden h-9 w-auto dark:block" />
        </Link>
        {info.isLoading ? <Loading label="Opening the invitation" /> : missing || !s ? (
          <>
            <h1 className="text-[24px] leading-8">This invitation link is not valid</h1>
            <p className="mt-2 text-sm text-fg-secondary">Check that the whole link was copied, or ask the business to send it again.</p>
          </>
        ) : joined ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-success" />
            <h1 className="mt-3 text-[24px] leading-8">You joined {s.business.name}</h1>
            <p className="mt-2 text-sm text-fg-secondary">{joined}</p>
          </>
        ) : closed || s.status !== "pending" ? (
          <>
            <h1 className="text-[24px] leading-8">This invitation is no longer open</h1>
            <p className="mt-2 text-sm text-fg-secondary">{closed ?? (s.status === "accepted" ? "It was accepted already. Log in to use it." : "It was cancelled or has expired. Ask the business to invite you again.")}</p>
            <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-primary hover:underline">Log in</Link></p>
          </>
        ) : (
          <>
            <h1 className="text-[24px] leading-8">Join {s.business.name}</h1>
            <p className="mt-2 text-sm text-fg-secondary">{s.business.name} invited {s.name} to EasAlpha as {s.role}. To join, confirm it is you with the code we send {via} to {s.to}.</p>
            {!sent ? (
              <div className="mt-6 space-y-4">
                {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
                <Button className="w-full" loading={busy} onClick={sendCode}>Send code</Button>
              </div>
            ) : !choose ? (
              <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); accept(); }}>
                <Field label="Code"><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus className="h-11 text-center text-lg tracking-[0.5em]" /></Field>
                {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
                <Button type="submit" className="w-full" loading={busy}>Join</Button>
                <Button type="button" variant="link" className="w-full" onClick={sendCode} disabled={busy}>Send the code again</Button>
              </form>
            ) : (
              <div className="mt-6 space-y-5">
                <p className="text-sm text-fg-secondary">This {s.proof} is on an EasAlpha login that has not confirmed it.</p>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); accept({ password }); }}>
                  <Field label="Password of that login" hint="If it is yours, join with it."><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" /></Field>
                  <Button type="submit" className="w-full" loading={busy} disabled={!password}>Join with that login</Button>
                </form>
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm text-fg-secondary">Not yours, or no password? Join with a login of your own; the other login gives this {s.proof} up.</p>
                  {s.proof === "email" ? <Field label="Choose a password" hint="At least 8 characters, to log in to the admin later"><Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-12" /></Field> : null}
                  <Button variant="secondary" className="w-full" loading={busy} onClick={() => accept({ new_login: true, ...(newPassword ? { new_password: newPassword } : {}) })}>Join with a new login</Button>
                </div>
                {error ? <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{error}</p> : null}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
