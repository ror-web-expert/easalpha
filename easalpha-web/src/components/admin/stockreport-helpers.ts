import type { BadgeVariant } from "@/components/ui";
import type { DeductionHealthBucket, DemandBucket, DemandRowBucket, SafetyNetStatus } from "@/lib/types";
import { formatTime } from "@/lib/dates";
import { formatSignedQty } from "@/lib/units";

// ---- Demand (SPEC: Low stock, Critical, Out of stock, All needing stock, Everything in use) ----
export const DEMAND_BUCKETS: { value: DemandBucket; label: string }[] = [
  { value: "low", label: "Low stock" },
  { value: "critical", label: "Critical" },
  { value: "out", label: "Out of stock" },
  { value: "all_needing", label: "All needing stock" },
  { value: "everything", label: "Everything in use" },
];

export function demandBucketLabel(bucket: DemandRowBucket | string | null | undefined): string {
  switch (bucket) {
    case "out": return "Out of stock";
    case "critical": return "Critical";
    case "low": return "Low stock";
    case "ok": return "In stock";
    default: return "";
  }
}

export function demandBucketVariant(bucket: DemandRowBucket | string | null | undefined): BadgeVariant {
  switch (bucket) {
    case "out": return "danger";
    case "critical": return "warning";
    case "low": return "info";
    case "ok": return "success";
    default: return "neutral";
  }
}

// ---- Deduction Health buckets ----
export const HEALTH_BUCKETS: { value: DeductionHealthBucket; label: string; sub: string; hint: string }[] = [
  { value: "ok", sub: "Deducted in full", label: "OK", hint: "Every line had a recipe and stock was deducted." },
  { value: "missing", sub: "No recipes at all", label: "Missing", hint: "No line had a recipe; nothing was deducted." },
  { value: "partial", sub: "Some lines had no recipe", label: "Partial", hint: "Some lines had no recipe; those were not deducted." },
  { value: "reversed", sub: "Stock returned", label: "Reversed", hint: "Cancelled before cooking and stock was returned." },
  { value: "waste", sub: "Kept as waste", label: "Waste", hint: "Cancelled after cooking: the deduction stays as waste." },
  { value: "skipped", sub: "Deduction switched off", label: "Skipped", hint: "Stock deduction on sale is switched off." },
  { value: "error", sub: "Deduction failed", label: "Error", hint: "Deduction failed; open the order for the detail." },
  { value: "never_ran", sub: "Needs the safety net", label: "Never ran", hint: "Completed orders the deduction never reached. The safety net picks these up." },
];

export function healthBucketVariant(bucket: DeductionHealthBucket | string | null | undefined): BadgeVariant {
  switch (bucket) {
    case "ok": return "success";
    case "partial": case "skipped": case "pending": return "warning";
    case "missing": case "error": case "never_ran": return "danger";
    case "reversed": return "info";
    case "waste": return "accent";
    default: return "neutral";
  }
}

/** SummaryCard tone for a bucket: the badge tone, with accent folded into info. */
export function healthBucketTone(bucket: DeductionHealthBucket | string): "primary" | "success" | "danger" | "warning" | "info" | "neutral" {
  const v = healthBucketVariant(bucket);
  return v === "accent" || v === "brand" ? "info" : v === "outline" ? "neutral" : v;
}

export function healthBucketLabel(bucket: DeductionHealthBucket | string): string {
  return HEALTH_BUCKETS.find((b) => b.value === bucket)?.label ?? (bucket === "pending" ? "Pending" : bucket);
}

/** Buckets that need a look: everything but ok, reversed and waste (those are expected outcomes). */
export function healthProblemCount(buckets: Partial<Record<string, number>> | undefined): number {
  if (!buckets) return 0;
  return ["missing", "partial", "error", "never_ran"].reduce((a, k) => a + (buckets[k] ?? 0), 0);
}

// ---- Safety net ----
/** "Last run 10:32 am, 3 checked, 1 deducted" (", 2 errors" when any), or "Not run yet". */
export function safetyNetSentence(s: Pick<SafetyNetStatus, "last_run_at" | "last_checked" | "last_deducted" | "last_errors"> | null | undefined): string {
  if (!s?.last_run_at) return "Not run yet";
  const parts = [`Last run ${formatTime(s.last_run_at)}`, `${s.last_checked ?? 0} checked`, `${s.last_deducted ?? 0} deducted`];
  if (s.last_errors) parts.push(`${s.last_errors} ${s.last_errors === 1 ? "error" : "errors"}`);
  return parts.join(", ");
}

export function safetyNetTriggerLabel(trigger: string | null | undefined): string {
  switch (trigger) {
    case "manual": return "Run by hand";
    case "job": return "Scheduled";
    default: return trigger ? trigger : "";
  }
}

// ---- Order lookup: a serial like "1234" or "#1234" searches by serial; anything else is treated as an order id ----
export type OrderLookup = { serial: number } | { id: string } | null;
export function parseOrderLookup(input: string): OrderLookup {
  const s = input.trim();
  if (!s) return null;
  if (/^#?\d+$/.test(s)) return { serial: Number(s.replace("#", "")) };
  return { id: s };
}

// ---- Variance (Actual vs Theoretical): positive means more was found than recipes expected ----
export function formatVariance(qty: string | number | null | undefined, unitCode: string | null | undefined): string {
  const n = Number(qty ?? 0);
  if (n === 0) return "0";
  return formatSignedQty(n, unitCode);
}

export function varianceTone(qty: string | number | null | undefined): "success" | "danger" | undefined {
  const n = Number(qty ?? 0);
  if (n > 0) return "success";
  if (n < 0) return "danger";
  return undefined;
}

export const varianceClass = (qty: string | number | null | undefined) => {
  const t = varianceTone(qty);
  return t === "danger" ? "font-medium text-danger" : t === "success" ? "font-medium text-success" : "text-fg-muted";
};

/** SPEC: negative stock is permitted and displayed as "short". */
export function stockStatusLabel(row: { negative: boolean; below_minimum: boolean }): { label: string; variant: BadgeVariant } {
  if (row.negative) return { label: "short", variant: "danger" };
  if (row.below_minimum) return { label: "low", variant: "warning" };
  return { label: "OK", variant: "success" };
}
