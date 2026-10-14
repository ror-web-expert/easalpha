import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { SignupForm } from "@/components/site/signup-form";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { Analytics } from "@/components/site/analytics";
import { TRIAL_DAYS } from "@/components/site/site-helpers";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbs } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Create your account, 90 days free",
  description: "Start your 90-day free EasAlpha trial: offline till, kitchen display, inventory, accounts, payroll, riders and WhatsApp receipts for your restaurant. No card.",
  alternates: { canonical: "/signup", languages: { en: "/signup", "x-default": "/signup" } },
  robots: { index: true, follow: true },
};

const INCLUDED = [
  "Admin panel, till, kitchen display, order-taker tablet and rider app",
  "Menu import from a spreadsheet and a setup checklist",
  "Offline selling with receipts on 58 or 80 mm paper",
  "Inventory with recipes, purchasing and supplier ledgers",
  "Double-entry accounts, attendance and payroll",
  "Customers with khata, loyalty, vouchers and WhatsApp receipts",
  "All 27 reports with CSV and PDF export",
];

export default function SignupPage() {
  return (
    <main className="grid min-h-screen bg-white text-slate-800 lg:grid-cols-[1fr_1.1fr]">
      <JsonLd data={breadcrumbs("Create your account", "/signup")} />
      <section className="relative hidden overflow-hidden bg-linear-to-br from-[#0B1F3A] to-[#10294D] p-12 text-white [--heading-color:#fff] lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#FF7A1A]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-[26rem] w-[26rem] rounded-full bg-[#FF7A1A]/20 blur-3xl" />
        <Link href="/" className="relative flex items-center" aria-label="EasAlpha home">
          <Image src="/brand/logo-white.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto" />
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="inline-flex rounded-full bg-brand-cta px-3 py-1 text-sm font-bold text-white">{TRIAL_DAYS} days free, no card</p>
          <h2 className="mt-5 text-[44px] font-extrabold leading-[1.05] tracking-[-0.02em]">Your whole restaurant, set up this afternoon.</h2>
          <p className="mt-4 text-lg text-white/80">Every plan&apos;s features are open during the trial. Pick a plan when you are ready; until then nothing is charged.</p>
          <ul className="mt-8 space-y-3">
            {INCLUDED.map((i) => (
              <li key={i} className="flex items-start gap-3 text-white/90"><Check className="mt-1 h-4 w-4 shrink-0 text-[#FF7A1A]" />{i}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-lg">
          <Link href="/" className="mb-8 flex min-h-11 items-center lg:hidden" aria-label="EasAlpha home">
            <Image src="/brand/logo.svg" alt="EasAlpha" width={150} height={37} priority unoptimized className="h-9 w-auto" />
          </Link>
          <h1 className="text-[36px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#0B1F3A]">Create your account</h1>
          <p className="mt-2 text-slate-600">Start your {TRIAL_DAYS}-day free trial. You will land in the admin panel signed in.</p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-slate-100" />}>
              <SignupForm />
            </Suspense>
          </div>
          <p className="mt-10 text-center text-xs text-slate-500">Till staff do not sign up here: the owner adds them and they log in on a paired device with a PIN.</p>
        </div>
      </section>
      <WhatsAppFab />
      <Analytics />
    </main>
  );
}
