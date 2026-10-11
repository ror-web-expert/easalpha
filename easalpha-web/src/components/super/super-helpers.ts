// Pure helpers for the owner panel (/super). No React, no fetch: these are unit-tested in super-helpers.test.ts.
import type { BadgeVariant } from "@/components/ui/badge";
import type { Branch, Business, BusinessRef, HeaderPills, Membership, PlatformInfo, Session, SuperHealth, User } from "@/lib/types";

export const BUSINESS_STATUSES = ["trial", "active", "grace", "read_only", "deleted"] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export const BUSINESS_STATUS_HINTS: Record<BusinessStatus, string> = {
  trial: "Free trial: everything works until the trial end date.",
  active: "Paying customer: everything works.",
  grace: "Payment overdue but still working; the admin panel shows a banner.",
  read_only: "Tills and admin can look but not sell or change anything.",
  deleted: "Hidden from the business and its staff. Data stays until a purge.",
};

export function businessStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "trial": return "info";
    case "active": return "success";
    case "grace": return "warning";
    case "read_only": return "danger";
    case "deleted": return "outline";
    default: return "neutral";
  }
}

export function invoiceStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "paid": return "success";
    case "reported": return "warning";
    case "open": case "pending": return "info";
    case "void": return "outline";
    default: return "neutral";
  }
}

/** An invoice the owner can mark as paid: the business reported a payment, or it is still open. */
export function invoiceActionable(status: string | null | undefined): boolean {
  return status === "reported" || status === "open" || status === "pending";
}

export function supportRequestStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "open": return "warning";
    case "answered": return "success";
    case "closed": return "outline";
    default: return "neutral";
  }
}

export function supportRequestCategoryVariant(category: string | null | undefined): BadgeVariant {
  switch (category) {
    case "problem": return "danger";
    case "billing": return "brand";
    case "feature": return "accent";
    case "question": return "info";
    default: return "neutral";
  }
}

export function supportSessionStatusVariant(status: string | null | undefined, active?: boolean): BadgeVariant {
  if (status === "approved") return active ? "success" : "outline";
  switch (status) {
    case "requested": return "warning";
    case "denied": return "danger";
    case "ended": case "expired": return "outline";
    default: return "neutral";
  }
}

/** "Global" for a platform-wide flag, otherwise the business name or a short id. */
export function flagScopeLabel(businessId: string | null | undefined, businessName?: string | null): string {
  if (!businessId) return "Global";
  if (businessName) return businessName;
  return `Business ${businessId.slice(0, 8)}`;
}

/** Whole seconds from `now` until an ISO time; 0 when missing or already past. */
export function secondsUntil(expiresAt: string | null | undefined, now: number = Date.now()): number {
  if (!expiresAt) return 0;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((t - now) / 1000));
}

/** POST /super/support_sessions/:id/token */
export interface SupportTokenResponse { access_token: string; expires_at: string | null; business: Business }

/** GET /me with the support access token (the fields the admin Session needs). */
export interface MePayload {
  user: User; business: Business; branch: Branch | null; branches?: Branch[]; membership: Membership; permissions: string[];
  businesses: BusinessRef[]; pills?: HeaderPills | null;
}

/** Builds the admin Session that /admin expects (the same shape POST /auth/login returns) from the support token
 *  and GET /me. There is no refresh token: the session ends at `expires_at`, so `expires_in` counts down to it. */
export function composeSupportSession(token: SupportTokenResponse, me: MePayload, now: number = Date.now()): Session {
  return {
    access_token: token.access_token,
    refresh_token: "",
    token_type: "Bearer",
    expires_in: secondsUntil(token.expires_at, now),
    app: "admin",
    user: me.user,
    business: me.business ?? token.business,
    branch: me.branch ?? null,
    membership: me.membership,
    permissions: me.permissions ?? [],
    businesses: me.businesses ?? [],
    pills: me.pills ?? null,
  };
}

export interface HealthCheck { label: string; value: string; ok: boolean }

/** The health card rows: each one green or red. */
export function healthChecks(h: SuperHealth): HealthCheck[] {
  return [
    { label: "Database", value: h.database ? "Connected" : "Down", ok: h.database },
    { label: "Pending jobs", value: h.pending_jobs === null ? "Unknown" : String(h.pending_jobs), ok: h.pending_jobs !== null && h.pending_jobs < 100 },
    { label: "Failed tax invoices", value: String(h.tax_failed), ok: h.tax_failed === 0 },
    { label: "Failed WhatsApp (24h)", value: String(h.whatsapp_failed_24h), ok: h.whatsapp_failed_24h === 0 },
    { label: "Version", value: h.version, ok: true },
  ];
}

export type PlatformValues = Omit<PlatformInfo, "version">;
export type PlatformKey = keyof PlatformValues;

export interface PlatformField { key: PlatformKey; label: string; hint: string; type: "text" | "email" | "tel" | "url" | "textarea" }

/** Every key PUT /super/platform_settings accepts, in form order. `announcement_level` is a select, handled apart. */
export const PLATFORM_FIELDS: PlatformField[] = [
  { key: "product_name", label: "Product name", hint: "Shown in the Help box title and the footer of every admin panel.", type: "text" },
  { key: "support_email", label: "Support email", hint: "Restaurants write here from the Help & Support box.", type: "email" },
  { key: "support_whatsapp", label: "Support WhatsApp", hint: "International format, e.g. +923001234567. Opens a WhatsApp chat from the Help box.", type: "tel" },
  { key: "support_phone", label: "Support phone", hint: "Optional. A number to call; leave blank to hide it.", type: "tel" },
  { key: "support_hours", label: "Support hours", hint: "Plain words, e.g. 10 am to 11 pm Pakistan time, every day.", type: "text" },
  { key: "support_url", label: "Support page URL", hint: "Optional. A help desk or contact page link.", type: "url" },
  { key: "docs_url", label: "Documentation URL", hint: "Optional. User guide link shown in the Help box.", type: "url" },
  { key: "powered_by", label: "Powered-by line", hint: "Printed on receipts and shown under the Help box, e.g. Powered by EasAlpha.", type: "text" },
  { key: "announcement", label: "Announcement", hint: "Optional. A one-line notice every admin panel shows at the top. Blank hides it.", type: "textarea" },
  { key: "downloads_url", label: "Downloads URL", hint: "Leave blank and the Download page links to this website's own /downloads folder, so the links follow the address the site runs on (localhost now, your domain once live). Set a URL only when the installers live elsewhere.", type: "url" },
  { key: "desktop_version", label: "Desktop version", hint: "The installer version the Download page offers, e.g. 0.2.0. Change it on every desktop release.", type: "text" },
];

export const ANNOUNCEMENT_LEVELS: { value: PlatformValues["announcement_level"]; label: string }[] = [
  { value: "info", label: "Info (blue)" },
  { value: "warning", label: "Warning (orange)" },
];

/** What a restaurant will see: a blank value falls back to the default. */
export function effectivePlatformValues(values: Partial<PlatformValues>, defaults: PlatformValues): PlatformValues {
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, v] of Object.entries(values)) {
    if (!(k in defaults)) continue;
    out[k] = v === null || v === undefined || v === "" ? (defaults as Record<string, unknown>)[k] : v;
  }
  return out as PlatformValues;
}

/** Form state (strings) -> PUT body. Blank strings are sent as null so the API restores the default. */
export function platformPayload(form: Record<string, string>): { values: Record<string, string | null> } {
  const values: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(form)) values[k] = v.trim() === "" ? null : v.trim();
  return { values };
}

/** GET values (null for defaults) -> form state (strings). */
export function platformForm(values: Partial<PlatformValues>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of PLATFORM_FIELDS) out[f.key] = (values[f.key] as string | null | undefined) ?? "";
  out.announcement_level = values.announcement_level ?? "info";
  return out;
}

export function whatsappHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
