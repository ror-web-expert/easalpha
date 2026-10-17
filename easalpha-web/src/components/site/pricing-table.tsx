"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { track, trackAttrs } from "@/lib/analytics";
import {
  FEATURE_LABELS, PLANS, TRIAL_DAYS, type Currency, type FeatureKey, type Period, displayPriceMinor, formatMoney,
  monthlyMinor, yearlyMinor, yearlySavingMinor,
} from "./site-helpers";

const FEATURE_ORDER: FeatureKey[] = ["kitchen_display", "tables", "inventory", "riders", "tax", "online_ordering", "multi_branch", "payroll", "loyalty", "aggregators", "own_whatsapp_number", "custom_domain"];

function Toggle<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-[#E6EBF2] bg-[#F4F7FB] p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition max-md:min-h-11", value === o.value ? "bg-[#0B1F3A] text-white shadow-sm" : "text-slate-600 hover:text-[#0B1F3A]")}>
          {o.label}{o.hint ? <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold", value === o.value ? "bg-brand-cta text-white" : "bg-[#FFE4D1] text-[#9A3412]")}>{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** compact: five highlights per plan and no comparison table (the homepage). Plan names are h2 on the pricing page,
 *  where nothing but the h1 precedes them, and h3 on the homepage under its section heading. */
export function PricingTable({ compact = false }: { compact?: boolean }) {
  const PlanName = compact ? "h3" : "h2";
  const [currency, setCurrency] = useState<Currency>("PKR");
  const [period, setPeriod] = useState<Period>("monthly");
  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        <Toggle label="Billing period" value={period} onChange={(v) => { setPeriod(v); track("pricing_toggle", { billing: v, currency }); }} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly", hint: "2 months free" }]} />
        <Toggle label="Currency" value={currency} onChange={(v) => { setCurrency(v); track("pricing_toggle", { billing: period, currency: v }); }} options={[{ value: "PKR", label: "PKR" }, { value: "USD", label: "USD" }]} />
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const m = monthlyMinor(p, currency);
          return (
            <div key={p.code} className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_18px_40px_-24px_rgba(11,31,58,0.45)]", p.popular ? "border-[#0B1F3A] ring-1 ring-[#0B1F3A] lg:-translate-y-4 lg:shadow-[0_40px_80px_-30px_rgba(11,31,58,0.55)]" : "border-[#E6EBF2]")}>
              <div className={cn("px-7 pb-6 pt-7", p.popular ? "bg-[#0B1F3A] text-white [--heading-color:#fff]" : "text-[#0B1F3A] [--heading-color:#0B1F3A]")}>
                <div className="flex items-center justify-between gap-3">
                  <PlanName className="text-lg font-bold">{p.name}</PlanName>
                  {p.popular ? <span className="rounded-full bg-brand-cta px-3 py-1 text-xs font-bold text-white">Most popular</span> : null}
                </div>
                <p className={cn("mt-1 text-sm", p.popular ? "text-white/80" : "text-slate-600")}>{p.tagline}</p>
                <div className="mt-6 flex items-end gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight">{formatMoney(displayPriceMinor(p, currency, period), currency)}</span>
                  <span className={cn("pb-1.5 text-sm", p.popular ? "text-white/70" : "text-slate-500")}>/ month</span>
                </div>
                <p className={cn("mt-1 min-h-5 text-xs", p.popular ? "text-white/70" : "text-slate-500")}>
                  {period === "yearly" ? `${formatMoney(yearlyMinor(m), currency)} billed yearly, save ${formatMoney(yearlySavingMinor(m), currency)}` : "Billed monthly, cancel any time"}
                </p>
              </div>
              <div className="flex flex-1 flex-col px-7 pb-7 pt-6">
                <Link href={`/signup?plan=${p.code}`} {...trackAttrs("cta_start_free_click", { where: `pricing_${p.code}` })} className={cn("inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition", p.popular ? "bg-brand-cta text-white hover:bg-brand-cta-hover" : "border border-[#0B1F3A]/30 text-[#0B1F3A] hover:bg-[#F4F7FB]")}>
                  Start {TRIAL_DAYS}-day free trial
                </Link>
                <ul className="mt-7 space-y-2.5 text-sm text-slate-700">
                  {(compact ? p.highlights.slice(0, 5) : p.highlights).map((h) => (
                    <li key={h} className="flex items-start gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF7A1A]" />{h}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {!compact ? (
        <div className="mt-16 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="bg-[#0B1F3A] text-left text-white [--heading-color:#fff]">
                <th scope="col" className="px-5 py-4 font-semibold">What you get</th>
                {PLANS.map((p) => (
                  <th key={p.code} scope="col" className="px-5 py-4 font-semibold">
                    {p.name}
                    <div className="mt-0.5 text-xs font-normal text-white/70">{formatMoney(displayPriceMinor(p, currency, period), currency)} / month</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">Tills</th>{PLANS.map((p) => <td key={p.code} className="px-5 py-3 text-slate-700">{p.limits.tills === null ? "Unlimited" : p.limits.tills}</td>)}</tr>
              <tr><th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">Staff logins</th>{PLANS.map((p) => <td key={p.code} className="px-5 py-3 text-slate-700">{p.limits.staff === null ? "Unlimited" : p.limits.staff}</td>)}</tr>
              <tr><th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">Branches</th>{PLANS.map((p) => <td key={p.code} className="px-5 py-3 text-slate-700">{p.limits.branches}</td>)}</tr>
              <tr><th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">WhatsApp messages a month</th>{PLANS.map((p) => <td key={p.code} className="px-5 py-3 text-slate-700">{p.limits.whatsappMessages.toLocaleString("en-US")}</td>)}</tr>
              <tr><th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">Offline till, receipts, customers, khata, expenses, reports</th>{PLANS.map((p) => <td key={p.code} className="px-5 py-3"><Check className="h-4 w-4 text-[#FF7A1A]" aria-label="Included" /></td>)}</tr>
              {FEATURE_ORDER.map((k) => (
                <tr key={k}>
                  <th scope="row" className="px-5 py-3 text-left font-medium text-slate-700">{FEATURE_LABELS[k]}</th>
                  {PLANS.map((p) => (
                    <td key={p.code} className="px-5 py-3">{p.features[k] ? <Check className="h-4 w-4 text-[#FF7A1A]" aria-label="Included" /> : <Minus className="h-4 w-4 text-slate-300" aria-label="Not included" />}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
