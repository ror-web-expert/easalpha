"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Session } from "@/lib/types";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { COUNTRIES, DEFAULT_COUNTRY, PASSWORD_MIN, PLANS, type SignupErrors, type SignupInput, countryByCode, detectCountry, passwordStrength, signupPayload, validateSignup } from "./site-helpers";

const STRENGTH: Record<ReturnType<typeof passwordStrength>, { width: string; color: string; text: string }> = {
  "too short": { width: "w-1/4", color: "bg-slate-300", text: `At least ${PASSWORD_MIN} characters` },
  weak: { width: "w-2/4", color: "bg-amber-500", text: "Weak: add numbers or capitals" },
  good: { width: "w-3/4", color: "bg-[#FF7A1A]", text: "Good" },
  strong: { width: "w-full", color: "bg-emerald-600", text: "Strong" },
};

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const planCode = params.get("plan");
  const plan = PLANS.find((p) => p.code === planCode);
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [form, setForm] = useState<SignupInput>({ name: "", businessName: "", email: "", phone: "+92 ", password: "", agree: false, country: DEFAULT_COUNTRY });
  // The browser's locale picks the country on first paint; the dialling code follows it until the owner types a number.
  useEffect(() => {
    const code = detectCountry(typeof navigator === "undefined" ? null : navigator.language);
    if (code !== DEFAULT_COUNTRY) setForm((f) => ({ ...f, country: code, phone: `${countryByCode(code).dial} ` }));
  }, []);
  const changeCountry = (code: string) => {
    setForm((f) => {
      const prevDial = countryByCode(f.country).dial;
      const untouched = f.phone.trim() === "" || f.phone.trim() === prevDial;
      return { ...f, country: code, phone: untouched ? `${countryByCode(code).dial} ` : f.phone };
    });
  };
  const [touched, setTouched] = useState<Partial<Record<keyof SignupInput, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; exists?: boolean } | null>(null);

  // Same session handling as /login: the store persists to localStorage and /admin reads it.
  useEffect(() => { if (hydrated && session) router.replace("/admin"); }, [hydrated, session, router]);

  const errors: SignupErrors = validateSignup(form);
  const show = (k: keyof SignupInput) => (touched[k] ? errors[k] : undefined);
  const set = <K extends keyof SignupInput>(k: K, v: SignupInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const blur = (k: keyof SignupInput) => setTouched((t) => ({ ...t, [k]: true }));
  const strength = STRENGTH[passwordStrength(form.password)];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, businessName: true, email: true, phone: true, password: true, agree: true });
    if (Object.keys(errors).length) return;
    setBusy(true); setError(null);
    try {
      const s = await api<Session>("/auth/signup", { method: "POST", body: signupPayload(form), auth: "none" });
      qc.clear(); // as at login: nothing cached for an earlier session carries over to the new business
      setSession(s);
      router.replace("/admin");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError({ text: "An account with this email or phone already exists.", exists: true });
      else if (err instanceof ApiError && err.isNetwork) setError({ text: "We could not reach the server. Check your connection and try again." });
      else setError({ text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {plan ? <p className="rounded-lg bg-[#E8EEF7] px-4 py-3 text-sm text-[#0B1F3A]">You picked the <strong>{plan.name}</strong> plan. Your trial includes everything in it; nothing is charged until the trial ends.</p> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" error={show("name")}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={() => blur("name")} autoComplete="name" placeholder="Ali Raza" required className="h-12" aria-invalid={!!show("name")} />
        </Field>
        <Field label="Restaurant name" error={show("businessName")}>
          <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} onBlur={() => blur("businessName")} autoComplete="organization" placeholder="Downtown Grill" required className="h-12" aria-invalid={!!show("businessName")} />
        </Field>
      </div>
      <Field label="Email" error={show("email")} hint="You log in with this and we send your invoices here.">
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} autoComplete="email" placeholder="you@restaurant.com" required className="h-12" aria-invalid={!!show("email")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field label="Country" hint="Sets your currency and time zone; both can be changed later.">
          <select value={form.country} onChange={(e) => changeCountry(e.target.value)} autoComplete="country" className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#FF7A1A] focus:outline-none focus:ring-2 focus:ring-[#FF7A1A]/30">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
          </select>
        </Field>
        <Field label="Mobile number" error={show("phone")} hint="With country code. Used for WhatsApp login codes.">
          <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => blur("phone")} autoComplete="tel" inputMode="tel" placeholder={`${countryByCode(form.country).dial} 300 1234567`} required className="h-12" aria-invalid={!!show("phone")} />
        </Field>
      </div>
      <Field label="Password" error={show("password")}>
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => set("password", e.target.value)} onBlur={() => blur("password")} autoComplete="new-password" minLength={PASSWORD_MIN} required className="h-12 pr-12" aria-invalid={!!show("password")} aria-describedby="password-strength" />
          <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div id="password-strength" className="mt-2 flex items-center gap-3 text-xs text-slate-500" aria-live="polite">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className={cn("block h-full rounded-full transition-all", strength.width, form.password ? strength.color : "bg-transparent")} /></span>
          <span className="w-44 text-right">{form.password ? strength.text : `At least ${PASSWORD_MIN} characters`}</span>
        </div>
      </Field>
      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.agree} onChange={(e) => { set("agree", e.target.checked); blur("agree"); }} aria-invalid={!!show("agree")} className="mt-1 h-[18px] w-[18px] shrink-0 rounded-[2px] accent-[#FF7A1A]" />
          <span>I agree to the <Link href="/terms" className="-mx-1 px-1 py-3.5 font-medium text-[#C2410C] hover:underline">terms</Link> and <Link href="/privacy" className="-mx-1 px-1 py-3.5 font-medium text-[#C2410C] hover:underline">privacy policy</Link>.</span>
        </label>
        {show("agree") ? <p className="mt-1 text-xs text-[#ba1a1a]">{errors.agree}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
          {error.text}{error.exists ? <> <Link href="/login" className="py-3.5 font-medium underline">Log in instead</Link>.</> : null}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full bg-brand-cta font-semibold text-white hover:bg-brand-cta-hover" loading={busy}>Create my account</Button>
      <p className="text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="-mx-1 px-1 py-3.5 font-medium text-[#C2410C] hover:underline">Log in</Link></p>
    </form>
  );
}
