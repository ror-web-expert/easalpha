// Pure helpers for the Customers screens (ledger, payments, insights, account), the marketing settings (regular
// discounts, vouchers, reviews, WhatsApp templates) and the Website Config builder. SPEC "Customers, credit, loyalty
// and feedback": a balance reads Settled or To Receive; regular discounts pick the smallest day window; vouchers fix
// value, minimum spend and expiry; reviews show a 1-to-5 rating as a word; templates are built from {variables}.
import type { BadgeVariant } from "@/components/ui/badge";
import type { RegularDiscountTier, VoucherBatch, VoucherStatus } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

// ---- Customers ----
export type BalanceLabel = "Settled" | "To Receive" | "In credit";

/** SPEC: a balance reads Settled or To Receive. A negative balance (customer paid ahead) reads In credit. */
export function balanceLabel(balanceMinor: number | null | undefined): BalanceLabel {
  const n = Number(balanceMinor ?? 0);
  if (n > 0) return "To Receive";
  if (n < 0) return "In credit";
  return "Settled";
}

export function balanceVariant(balanceMinor: number | null | undefined): BadgeVariant {
  const label = balanceLabel(balanceMinor);
  return label === "To Receive" ? "warning" : label === "In credit" ? "info" : "success";
}

export const CUSTOMER_STATUSES: { value: string; label: string; variant: BadgeVariant }[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "pending_approval", label: "Pending approval", variant: "warning" },
  { value: "deactivated", label: "Deactivated", variant: "neutral" },
];
export function customerStatusLabel(status: string | null | undefined): string {
  return CUSTOMER_STATUSES.find((s) => s.value === status)?.label ?? (status ?? "-");
}
export function customerStatusVariant(status: string | null | undefined): BadgeVariant {
  return CUSTOMER_STATUSES.find((s) => s.value === status)?.variant ?? "neutral";
}

export const CUSTOMER_SOURCES: { value: string; label: string }[] = [
  { value: "in_store", label: "In-store" }, { value: "online", label: "Online" }, { value: "qr", label: "QR" }, { value: "phone", label: "Phone" }, { value: "import", label: "Import" },
];
export function customerSourceLabel(source: string | null | undefined): string {
  return CUSTOMER_SOURCES.find((s) => s.value === source)?.label ?? (source ?? "-");
}

/** Ledger entry kinds as the admin reads them. */
export function ledgerKindLabel(kind: string): string {
  switch (kind) {
    case "charge": return "On account";
    case "payment": return "Payment";
    case "paid_out": return "Paid out";
    case "refund": return "Refund";
    default: return kind;
  }
}
export function ledgerKindVariant(kind: string): BadgeVariant {
  return kind === "charge" ? "warning" : kind === "payment" ? "success" : kind === "refund" ? "info" : "neutral";
}

// ---- Regular discounts ----
export const ORDER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "dine_in", label: "Dine-in" }, { value: "takeaway", label: "Takeaway" }, { value: "delivery", label: "Delivery" }, { value: "walk_in", label: "Walk-in" }, { value: "online", label: "Online" },
];

/** Tiers in the order the till evaluates them: smallest day window first. Stable for equal windows. */
export function sortTiers<T extends Pick<RegularDiscountTier, "within_days">>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.within_days - b.within_days);
}

/** Whole days between the customer's last order and now; null when they never ordered. */
export function daysSinceLastOrder(lastOrderAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!lastOrderAt) return null;
  const d = typeof lastOrderAt === "string" ? new Date(lastOrderAt) : lastOrderAt;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/** Mirrors Marketing::RegularDiscounts.tier_for: the smallest window the customer falls inside, skipping tiers that
 *  exclude the order type; customers who never ordered (null days) or are blocked get nothing. */
export function bestTier<T extends Pick<RegularDiscountTier, "within_days" | "excluded_order_types" | "active">>(
  tiers: T[], daysSince: number | null, opts: { orderType?: string; blocked?: boolean } = {},
): T | null {
  if (daysSince === null || daysSince < 0 || opts.blocked) return null;
  return sortTiers(tiers.filter((t) => t.active)).find((t) => daysSince <= t.within_days && !(opts.orderType && t.excluded_order_types.includes(opts.orderType))) ?? null;
}

/** "10%" or "Rs 150" for a tier or a voucher batch. value is in major units for fixed amounts, as the API stores it. */
export function discountValueLabel(kind: "percent" | "fixed", value: number): string {
  return kind === "percent" ? `${trimNumber(value)}%` : formatMoney(Math.round(value * 100));
}
function trimNumber(n: number): string { return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))); }

/** "Within 1 day" / "Within 7 days". */
export function withinDaysLabel(days: number): string { return `Within ${days} day${days === 1 ? "" : "s"}`; }

// ---- Vouchers ----
export type VoucherBatchState = "Active" | "Expired" | "Used up" | "Inactive";

/** The batch state in the order the API's flags take effect: inactive first, then expired, then exhausted. */
export function voucherBatchState(b: Pick<VoucherBatch, "active" | "expired" | "exhausted">): { label: VoucherBatchState; variant: BadgeVariant } {
  if (!b.active) return { label: "Inactive", variant: "neutral" };
  if (b.expired) return { label: "Expired", variant: "danger" };
  if (b.exhausted) return { label: "Used up", variant: "warning" };
  return { label: "Active", variant: "success" };
}

/** "No expiry", "Expires 12 Oct 2026", "Expires today" or "Expired 1 Oct 2026". Compares calendar days, not clock time. */
export function voucherExpiryLabel(expiresOn: string | null | undefined, now: Date = new Date()): string {
  if (!expiresOn) return "No expiry";
  const today = now.toISOString().slice(0, 10);
  const day = expiresOn.slice(0, 10);
  if (day === today) return "Expires today";
  return day < today ? `Expired ${formatDate(day)}` : `Expires ${formatDate(day)}`;
}

export function voucherStatusLabel(status: VoucherStatus | string): string {
  return status === "issued" ? "Issued" : status === "redeemed" ? "Redeemed" : status === "void" ? "Void" : status;
}
export function voucherStatusVariant(status: VoucherStatus | string): BadgeVariant {
  return status === "redeemed" ? "success" : status === "void" ? "neutral" : "info";
}

/** "20% off, minimum spend Rs 1,000" as the batch list reads it. */
export function voucherTerms(b: Pick<VoucherBatch, "value_kind" | "value" | "min_spend_minor">): string {
  const value = `${discountValueLabel(b.value_kind, b.value)} off`;
  return b.min_spend_minor > 0 ? `${value}, minimum spend ${formatMoney(b.min_spend_minor)}` : value;
}

export const CASHIER_LIMIT_NOTE = "A voucher's value was fixed when the batch was created, so applying one does not count against the cashier's own discount limit. Owners can hand out vouchers without widening what cashiers may discount on their own.";

// ---- Reviews ----
export const RATING_WORDS: Record<number, string> = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };

/** Mirrors Review#rating_word on the API; a missing rating reads Pending. */
export function ratingWord(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "Pending";
  return RATING_WORDS[rating] ?? "Pending";
}
export function ratingVariant(rating: number | null | undefined): BadgeVariant {
  if (!rating) return "neutral";
  return rating >= 4 ? "success" : rating === 3 ? "info" : "danger";
}
export const REVIEW_SOURCES: { value: string; label: string }[] = [
  { value: "tablet", label: "Tablet" }, { value: "website", label: "Website" }, { value: "pos", label: "POS" }, { value: "qr", label: "QR" },
];
/** "4.3" from the API's average, or "-" before anyone has rated. */
export function averageRatingLabel(avg: number | null | undefined): string {
  return avg === null || avg === undefined ? "-" : Number(avg).toFixed(1);
}

// ---- WhatsApp templates ----
/** Mirrors Whatsapp::Account.render: {name} and {{name}} are replaced; unknown names stay as written so the preview shows them. */
export function renderTemplate(body: string | null | undefined, vars: Record<string, string | number | null | undefined>): string {
  let out = body ?? "";
  for (const [k, v] of Object.entries(vars)) {
    const val = v === null || v === undefined ? "" : String(v);
    out = out.split(`{{${k}}}`).join(val).split(`{${k}}`).join(val);
  }
  return out;
}

/** Variable names used in a body, in order of first use and without duplicates. */
export function templateVariables(body: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (body ?? "").matchAll(/\{\{?([a-z_][a-z0-9_]*)\}?\}/gi)) {
    const name = m[1];
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Names the body uses that the account does not provide, so the editor can warn before saving. */
export function unknownVariables(body: string | null | undefined, known: string[]): string[] {
  return templateVariables(body).filter((v) => !known.includes(v));
}

/** Insert "{name}" at the caret of a textarea value and return the new text with where the caret should go. */
export function insertVariable(text: string, caret: number, name: string): { text: string; caret: number } {
  const at = Math.max(0, Math.min(caret, text.length));
  const token = `{${name}}`;
  return { text: text.slice(0, at) + token + text.slice(at), caret: at + token.length };
}

/** Sample values for the preview on the Manual Send and Templates tabs. */
export const SAMPLE_VARIABLES: Record<string, string> = {
  customer_name: "Ahmed Khan", order_number: "#1042", order_total: "2,450", order_items: "2x Chicken Karahi, 4x Naan", discount: "0", service_charge: "0", loyalty_points: "120",
  previous_balance: "5,000", new_balance: "7,450", business_name: "Your business", khata_no: "K-0017", due_amount: "7,450", link: "https://example.com/bill", code: "VOU-1234", value: "Rs 500", min_spend: "1,000", expires_on: "31 Dec 2026",
};

export function messageStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "sent": case "delivered": case "read": return "success";
    case "queued": case "pending": return "info";
    case "failed": case "error": return "danger";
    case "skipped": return "warning";
    default: return "neutral";
  }
}

// ---- Website Config ----
export type WebsiteFieldType = "switch" | "number" | "money" | "text" | "textarea" | "color" | "list" | "image" | "url" | "email" | "phone";

export const WEBSITE_SECTION_LABELS: Record<string, string> = {
  identity: "Store Identity", pages: "Pages", menu_slider: "Menu Slider", documents: "Documents", footer: "Footer", availability: "Availability", signups: "Customer Sign-ups",
  location: "Location", branches: "Branches", delivery: "Delivery", pricing: "Pricing", contact: "Contact", social: "Social Media", whatsapp: "WhatsApp", instagram: "Instagram",
  seo: "SEO", mobile_app: "Mobile App", system: "System",
};
export function websiteSectionLabel(section: string): string {
  return WEBSITE_SECTION_LABELS[section] ?? section.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LONG_TEXT_KEYS = new Set(["description", "greeting", "closed_message", "text", "terms", "privacy", "refund"]);
const NUMBER_KEYS = new Set(["lat", "lng", "eta_minutes"]);
const SOCIAL_SECTIONS = new Set(["social"]);

/** Which control a section key gets. Decided from the key name first (so null defaults still get the right control), then from the value. */
export function websiteFieldType(section: string, key: string, value: unknown): WebsiteFieldType {
  if (key === "theme_color") return "color";
  if (key.endsWith("_minor")) return "money";
  if (key.endsWith("_key")) return "image";
  if (key.endsWith("_url") || key === "map_link" || SOCIAL_SECTIONS.has(section)) return "url";
  if (key === "email") return "email";
  if (key === "phone" || key === "number" || key === "whatsapp") return "phone";
  if (NUMBER_KEYS.has(key)) return "number";
  if (LONG_TEXT_KEYS.has(key)) return "textarea";
  if (typeof value === "boolean") return "switch";
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "number";
  return "text";
}

/** "theme_color" -> "Theme colour", "free_above_minor" -> "Free above", "android_url" -> "Android URL". */
export function websiteFieldLabel(key: string): string {
  const words = key.replace(/_minor$/, "").replace(/_key$/, "").split("_").map((w) => (w === "url" || w === "seo" || w === "id" ? w.toUpperCase() : w));
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\bcolor\b/, "colour");
}

/** Lists are edited one item per line. Objects (footer links) round-trip as JSON lines. */
export function listToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("\n");
}
export function textToList(text: string): unknown[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => {
    if (s.startsWith("{") || s.startsWith("[")) { try { return JSON.parse(s); } catch { return s; } }
    return s;
  });
}

/** The slug the storefront URL uses: lowercase, hyphens, nothing else (mirrors the API's validation). */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Hex colour contrast: white text on dark themes, near-black on light ones. */
export function readableOn(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#191c23" : "#ffffff";
}
