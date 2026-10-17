import type { BillingPlan } from "@/lib/types";

export type BillingCurrency = "PKR" | "USD";

/** Each till beyond what the plan includes, a month: Rs 1,000 in Pakistan, $9 elsewhere, as Billing::Issuer charges. */
export const EXTRA_TILL_MINOR: Record<BillingCurrency, number> = { PKR: 1_000_00, USD: 9_00 };

/** Billing::Issuer invoices a Pakistani business in rupees and every other business in dollars. */
export function billingCurrency(country: string | null | undefined): BillingCurrency {
  return (country ?? "PK").toUpperCase() === "PK" ? "PKR" : "USD";
}

/** Tills the plan includes: null when the plan has no till limit (Business since 17 Oct 2026), 1 when it says nothing. */
export function includedTills(plan: Pick<BillingPlan, "limits">): number | null {
  const limits = (plan.limits ?? {}) as Record<string, number | null | undefined>;
  if (!("tills" in limits)) return 1;
  return limits.tills ?? null;
}

/** The invoice amount the API will issue: the plan price plus each extra till, times ten for a yearly cycle, in the
 *  business's billing currency. The admin Plan page multiplied the whole plan price by the till count before, so
 *  Business with 5 tills read Rs 44,995. */
export function planEstimate(plan: Pick<BillingPlan, "limits" | "price_pkr_minor" | "price_usd_minor">, cycle: "monthly" | "yearly", tills: number, currency: BillingCurrency = "PKR"): number {
  const included = includedTills(plan);
  const extra = included === null ? 0 : Math.max(0, Math.floor(tills) - included);
  const base = currency === "USD" ? plan.price_usd_minor ?? 0 : plan.price_pkr_minor;
  const monthly = base + extra * EXTRA_TILL_MINOR[currency];
  return cycle === "yearly" ? monthly * 10 : monthly;
}
